/**
 * DigiLocker OAuth2 Service
 * Handles complete KYC integration with DigiLocker:
 * - Authorization flow with state validation (CSRF protection)
 * - Token exchange with access token
 * - Document fetching (Aadhaar, PAN, Land Ownership)
 * - Encrypted vault storage with audit logging
 * - Session management with Redis
 */

import { FastifyInstance } from 'fastify';
import crypto from 'crypto';
import axios, { AxiosInstance } from 'axios';
import {
  DigiLockerConfig,
  DigiLockerAuthRequest,
  DigiLockerTokenResponse,
  AadhaarData,
  PANData,
  LandOwnershipData,
  KYCSession,
  VaultKYCRecord,
  KYCAuditLog,
  EventType
} from '../types/digilocker.js';
import { PostgresVaultService, VaultEncryptionService, hashSensitiveData } from '../utils/encryption.js';

export class DigiLockerService {
  private config: DigiLockerConfig;
  private httpClient: AxiosInstance;
  private vaultService: PostgresVaultService;
  private encryptionService: VaultEncryptionService;
  private server: FastifyInstance;

  constructor(server: FastifyInstance, config: DigiLockerConfig) {
    this.server = server;
    this.config = config;
    this.httpClient = axios.create({
      timeout: config.timeout || 30000,
      baseURL: config.digiLockerApiBase
    });
    this.vaultService = new PostgresVaultService(server, process.env.ENCRYPTION_KEY || '');
    this.encryptionService = new VaultEncryptionService(
      process.env.ENCRYPTION_KEY || '',
      process.env.ENCRYPTION_KEY_ID || 'default'
    );
  }

  /**
   * Generate DigiLocker authorization URL for OAuth2 flow
   * Creates state token for CSRF protection and stores in Redis
   */
  async generateAuthorizationUrl(userId: string, farmerId: string): Promise<DigiLockerAuthRequest> {
    const state = crypto.randomBytes(32).toString('hex');
    const nonce = crypto.randomBytes(16).toString('hex');

    // Store state and nonce in Redis for verification in callback
    const ttl = this.config.sessionTimeout || 600; // 10 minutes default
    const sessionKey = `kyc:state:${state}`;
    const sessionData = {
      userId,
      farmerId,
      nonce,
      createdAt: Date.now(),
      attempts: 0
    };

    await this.server.queues.connection.setEx(sessionKey, ttl, JSON.stringify(sessionData));
    this.server.log.info({ userId, state: state.substring(0, 8) }, 'Authorization URL generated');

    const authUrl = new URL(this.config.authorizationUrl);
    authUrl.searchParams.append('client_id', this.config.clientId);
    authUrl.searchParams.append('response_type', 'code');
    authUrl.searchParams.append('redirect_uri', this.config.redirectUri);
    authUrl.searchParams.append('scope', this.config.scope);
    authUrl.searchParams.append('state', state);
    authUrl.searchParams.append('nonce', nonce);

    return {
      clientId: this.config.clientId,
      redirectUri: this.config.redirectUri,
      scope: this.config.scope.split(' '),
      state,
      url: authUrl.toString(),
      nonce,
      expiresIn: ttl
    };
  }

  /**
   * Exchange authorization code for access token
   * Validates state for CSRF protection
   */
  async exchangeAuthCode(code: string, state: string): Promise<DigiLockerTokenResponse> {
    // Verify state to prevent CSRF attacks
    const sessionKey = `kyc:state:${state}`;
    const sessionData = await this.server.queues.connection.get(sessionKey);

    if (!sessionData) {
      this.server.log.error({ state: state.substring(0, 8) }, 'Invalid or expired state token');
      throw new Error('Invalid or expired authorization state');
    }

    const session = JSON.parse(sessionData);
    session.attempts = (session.attempts || 0) + 1;

    if (session.attempts > 3) {
      await this.server.queues.connection.del(sessionKey);
      throw new Error('Too many token exchange attempts');
    }

    try {
      const response = await this.httpClient.post(this.config.tokenUrl, {
        grant_type: 'authorization_code',
        code,
        client_id: this.config.clientId,
        client_secret: this.config.clientSecret,
        redirect_uri: this.config.redirectUri
      });

      // Clean up state after successful exchange
      await this.server.queues.connection.del(sessionKey);

      this.server.log.info({ userId: session.userId, code: code.substring(0, 8) }, 'Token exchange successful');

      return {
        accessToken: response.data.access_token,
        tokenType: 'Bearer',
        expiresIn: response.data.expires_in || 3600,
        scope: response.data.scope ? response.data.scope.split(' ') : this.config.scope.split(' '),
        refreshToken: response.data.refresh_token
      };
    } catch (error) {
      // Increment attempts and update Redis
      await this.server.queues.connection.setEx(sessionKey, 300, JSON.stringify(session));
      throw error;
    }
  }

  /**
   * Fetch Aadhaar data from DigiLocker with retry logic
   */
  async fetchAadhaarData(accessToken: string, retryCount = 0): Promise<AadhaarData> {
    try {
      const response = await this.httpClient.get('/documents/aadhaar', {
        headers: { Authorization: `Bearer ${accessToken}` }
      });

      const aadhaarData: AadhaarData = {
        uid: response.data.masked_aadhaar || response.data.aadhaar_number,
        name: response.data.name,
        dateOfBirth: response.data.dob,
        gender: response.data.gender,
        address: {
          street: response.data.address?.street,
          district: response.data.address?.district || response.data.address?.city || '',
          state: response.data.address?.state,
          pincode: response.data.address?.pincode,
          country: response.data.address?.country || 'IN'
        },
        refNumber: response.data.ref_number,
        docStatus: 'ACTIVE'
      };

      this.server.log.info({ aadhaarHash: hashSensitiveData(aadhaarData.uid) }, 'Aadhaar document fetched');

      return aadhaarData;
    } catch (error) {
      return this.handleRetry('fetchAadhaarData', error, retryCount, () =>
        this.fetchAadhaarData(accessToken, retryCount + 1)
      );
    }
  }

  /**
   * Fetch PAN data from DigiLocker with retry logic
   */
  async fetchPANData(accessToken: string, retryCount = 0): Promise<PANData> {
    try {
      const response = await this.httpClient.get('/documents/pan', {
        headers: { Authorization: `Bearer ${accessToken}` }
      });

      const panData: PANData = {
        number: response.data.pan_number,
        name: response.data.name_as_per_pan,
        fatherName: response.data.father_name,
        dateOfBirth: response.data.date_of_birth,
        type: response.data.pan_type || 'I',
        refNumber: response.data.ref_number,
        docStatus: 'ACTIVE'
      };

      this.server.log.info({ panHash: hashSensitiveData(panData.number) }, 'PAN document fetched');

      return panData;
    } catch (error) {
      return this.handleRetry('fetchPANData', error, retryCount, () =>
        this.fetchPANData(accessToken, retryCount + 1)
      );
    }
  }

  /**
   * Fetch Land Ownership data from DigiLocker with retry logic
   */
  async fetchLandOwnershipData(accessToken: string, retryCount = 0): Promise<LandOwnershipData> {
    try {
      const response = await this.httpClient.get('/documents/land-ownership', {
        headers: { Authorization: `Bearer ${accessToken}` }
      });

      const landData: LandOwnershipData = {
        surveyNumber: response.data.survey_number,
        villageCode: response.data.village_code,
        talukaCode: response.data.taluka_code,
        districtCode: response.data.district_code,
        stateCode: response.data.state_code,
        areaInHectares: response.data.area_in_hectares,
        ownershipType: response.data.ownership_type,
        ownership_percentage: response.data.ownership_percentage,
        refNumber: response.data.ref_number,
        originalDocument: response.data.original_document
      };

      this.server.log.info({ areaHash: hashSensitiveData(String(landData.areaInHectares)) }, 'Land ownership document fetched');

      return landData;
    } catch (error) {
      return this.handleRetry('fetchLandOwnershipData', error, retryCount, () =>
        this.fetchLandOwnershipData(accessToken, retryCount + 1)
      );
    }
  }

  /**
   * Encrypt and store KYC data in vault
   * Uses AES-256-GCM encryption for PII
   */
  async encryptAndStoreKYC(
    farmerId: string,
    aadhaarData: AadhaarData,
    panData: PANData,
    landOwnershipData: LandOwnershipData,
    digilockerRef: string
  ): Promise<VaultKYCRecord> {
    // Encrypt sensitive fields
    const aadhaarEncrypted = this.encryptionService.encrypt(aadhaarData.uid);
    const panEncrypted = this.encryptionService.encrypt(panData.number);
    const landOwnershipEncrypted = this.encryptionService.encrypt(
      JSON.stringify(landOwnershipData)
    );

    // Store in PostgreSQL vault with encrypted data
    await this.vaultService.storeAadhaarEncrypted(
      farmerId,
      aadhaarData.uid,
      aadhaarData.refNumber
    );

    await this.vaultService.storePANEncrypted(
      farmerId,
      panData.number,
      panData.refNumber
    );

    await this.vaultService.storeLandOwnershipEncrypted(
      farmerId,
      JSON.stringify(landOwnershipData),
      landOwnershipData.refNumber
    );

    await this.vaultService.markKYCCompleted(farmerId, 'VERIFIED', digilockerRef);

    const record: VaultKYCRecord = {
      farmerId,
      aadhaarEncrypted: aadhaarEncrypted.ciphertext,
      panEncrypted: panEncrypted.ciphertext,
      landOwnershipEncrypted: landOwnershipEncrypted.ciphertext,
      digilockerRef,
      kycStatus: 'COMPLETED',
      kycCompletedAt: new Date(),
      kycExpiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000) // 1 year
    };

    this.server.log.info({ farmerId, digilockerRef }, 'KYC stored in vault');

    return record;
  }

  /**
   * Get KYC session status
   */
  async getKYCStatus(sessionId: string): Promise<KYCSession> {
    const sessionKey = `kyc:session:${sessionId}`;
    const sessionData = await this.server.queues.connection.get(sessionKey);

    if (!sessionData) {
      throw new Error('Session not found or expired');
    }

    const session: KYCSession = JSON.parse(sessionData);
    return session;
  }

  /**
   * Complete OAuth callback handler
   * Exchanges code, fetches documents, encrypts and stores
   */
  async handleCallback(code: string, state: string): Promise<KYCSession> {
    const startTime = Date.now();

    try {
      // Exchange code for access token
      const tokenResponse = await this.exchangeAuthCode(code, state);

      // Retrieve user context from state
      const sessionKey = `kyc:state:${state}`;
      const sessionData = await this.server.queues.connection.get(sessionKey);
      if (!sessionData) throw new Error('Session context lost');

      const context = JSON.parse(sessionData);
      const { userId, farmerId } = context;

      // Create KYC session
      const sessionId = crypto.randomBytes(16).toString('hex');
      const kycSession: KYCSession = {
        sessionId,
        userId,
        farmerId,
        state,
        status: 'PENDING',
        documentsRequested: ['AADHAAR', 'PAN', 'LAND_OWNERSHIP'],
        documentsFetched: [],
        accessToken: tokenResponse.accessToken,
        startedAt: startTime,
        expiresAt: Date.now() + (tokenResponse.expiresIn * 1000),
        attempts: 0,
        lastError: null
      };

      // Store session in Redis
      const ttl = tokenResponse.expiresIn || 3600;
      await this.server.queues.connection.setEx(
        `kyc:session:${sessionId}`,
        ttl,
        JSON.stringify(kycSession)
      );

      // Fetch documents with retry logic
      const aadhaarData = await this.fetchAadhaarData(tokenResponse.accessToken);
      const panData = await this.fetchPANData(tokenResponse.accessToken);
      const landOwnershipData = await this.fetchLandOwnershipData(tokenResponse.accessToken);

      // Update session with fetched documents
      kycSession.documentsFetched = ['AADHAAR', 'PAN', 'LAND_OWNERSHIP'];
      kycSession.status = 'COMPLETED';

      // Encrypt and store in vault
      const vaultRecord = await this.encryptAndStoreKYC(
        farmerId,
        aadhaarData,
        panData,
        landOwnershipData,
        `${userId}-${Date.now()}`
      );

      // Update session to completed
      kycSession.aadhaarRefNumber = aadhaarData.refNumber;
      kycSession.panRefNumber = panData.refNumber;
      kycSession.landOwnershipRefNumber = landOwnershipData.refNumber;
      kycSession.vaultRecordId = farmerId;

      // Store final session state
      await this.server.queues.connection.setEx(
        `kyc:session:${sessionId}`,
        ttl,
        JSON.stringify(kycSession)
      );

      const duration = Date.now() - startTime;
      this.server.log.info(
        { userId, farmerId, sessionId, duration, documentsCount: kycSession.documentsFetched?.length || 0 },
        'KYC flow completed successfully'
      );

      return kycSession;
    } catch (error) {
      this.server.log.error({ error, state: state.substring(0, 8) }, 'KYC callback error');
      throw error;
    }
  }

  /**
   * Retry handler with exponential backoff
   */
  private async handleRetry<T>(
    operationName: string,
    error: any,
    retryCount: number,
    retryFn: () => Promise<T>
  ): Promise<T> {
    if (retryCount >= (this.config.retryAttempts || 3)) {
      this.server.log.error({ operation: operationName, retryCount, error }, 'Max retries exceeded');
      throw error;
    }

    const backoffMs = Math.pow(2, retryCount) * 1000; // Exponential backoff
    this.server.log.warn({ operation: operationName, retryCount, backoffMs }, 'Retrying operation');
    await new Promise(resolve => setTimeout(resolve, backoffMs));

    return retryFn();
  }

  /**
   * Audit log for compliance
   */
  private async auditLog(eventType: EventType, details: Record<string, any>): Promise<void> {
    const auditLog: KYCAuditLog = {
      eventId: crypto.randomBytes(16).toString('hex'),
      eventType,
      ipAddress: details.ipAddress || 'system',
      userAgent: details.userAgent || 'system',
      details,
      timestamp: new Date(),
      status: details.status || 'success'
    };

    try {
      await this.server.db.query(
        `INSERT INTO vault.kyc_audit_logs 
         (event_id, event_type, ip_address, user_agent, details, timestamp, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          auditLog.eventId,
          auditLog.eventType,
          auditLog.ipAddress,
          auditLog.userAgent,
          JSON.stringify(auditLog.details),
          auditLog.timestamp,
          auditLog.status
        ]
      );
    } catch (error) {
      this.server.log.error({ eventType, error }, 'Failed to write audit log');
    }
  }
}

/**
 * Factory function to create DigiLocker service
 */
export function createDigiLockerService(server: FastifyInstance): DigiLockerService {
  const config: DigiLockerConfig = {
    clientId: process.env.DIGILOCKER_CLIENT_ID || '',
    clientSecret: process.env.DIGILOCKER_CLIENT_SECRET || '',
    redirectUri: process.env.DIGILOCKER_REDIRECT_URI || 'http://localhost:3000/kyc/callback',
    authorizationUrl: process.env.DIGILOCKER_AUTH_URL || 'https://api.digilocker.gov.in/oauth/authorize',
    tokenUrl: process.env.DIGILOCKER_TOKEN_URL || 'https://api.digilocker.gov.in/oauth/token',
    digiLockerApiBase: process.env.DIGILOCKER_API_BASE || 'https://api.digilocker.gov.in',
    scope: 'read_aadhaar read_pan read_land_ownership audit:kyc',
    retryAttempts: 3,
    timeout: 30000,
    sessionTimeout: 600
  };

  if (!config.clientId || !config.clientSecret) {
    throw new Error('DigiLocker client credentials not configured');
  }

  return new DigiLockerService(server, config);
}

export type DigiLockerServiceType = DigiLockerService;

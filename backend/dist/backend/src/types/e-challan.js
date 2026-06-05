/**
 * E-Challan Type Definitions
 * Complete type system for digital challan workflow
 */
/**
 * Enums for Challan Status
 */
export var EChallanStatus;
(function (EChallanStatus) {
    EChallanStatus["DRAFT"] = "DRAFT";
    EChallanStatus["OTP_SENT"] = "OTP_SENT";
    EChallanStatus["OTP_VERIFIED"] = "OTP_VERIFIED";
    EChallanStatus["BUYER_SIGNED"] = "BUYER_SIGNED";
    EChallanStatus["FARMER_SIGNED"] = "FARMER_SIGNED";
    EChallanStatus["COMPLETED"] = "COMPLETED";
    EChallanStatus["ARCHIVED"] = "ARCHIVED";
    EChallanStatus["CANCELLED"] = "CANCELLED";
})(EChallanStatus || (EChallanStatus = {}));
/**
 * Enum for Signature Types
 */
export var ChallanSignatureType;
(function (ChallanSignatureType) {
    ChallanSignatureType["BUYER"] = "BUYER";
    ChallanSignatureType["FARMER"] = "FARMER";
    ChallanSignatureType["DELIVERY_AGENT"] = "DELIVERY_AGENT";
})(ChallanSignatureType || (ChallanSignatureType = {}));
/**
 * Enum for Signature Input Methods
 */
export var SignatureInputMethod;
(function (SignatureInputMethod) {
    SignatureInputMethod["CANVAS"] = "canvas";
    SignatureInputMethod["TYPED"] = "typed";
    SignatureInputMethod["PHOTO"] = "photo";
})(SignatureInputMethod || (SignatureInputMethod = {}));
/**
 * Enum for Audit Actions
 */
export var ChallanAuditAction;
(function (ChallanAuditAction) {
    ChallanAuditAction["CREATED"] = "CREATED";
    ChallanAuditAction["OTP_SENT"] = "OTP_SENT";
    ChallanAuditAction["OTP_VERIFIED"] = "OTP_VERIFIED";
    ChallanAuditAction["SIGNATURE_CAPTURED"] = "SIGNATURE_CAPTURED";
    ChallanAuditAction["BUYER_SIGNED"] = "BUYER_SIGNED";
    ChallanAuditAction["FARMER_SIGNED"] = "FARMER_SIGNED";
    ChallanAuditAction["COMPLETED"] = "COMPLETED";
    ChallanAuditAction["ARCHIVED"] = "ARCHIVED";
    ChallanAuditAction["CANCELLED"] = "CANCELLED";
    ChallanAuditAction["INTEGRITY_VERIFIED"] = "INTEGRITY_VERIFIED";
    ChallanAuditAction["TAMPER_DETECTED"] = "TAMPER_DETECTED";
})(ChallanAuditAction || (ChallanAuditAction = {}));
/**
 * Enum for Verification Methods
 */
export var VerificationMethod;
(function (VerificationMethod) {
    VerificationMethod["OTP"] = "OTP";
    VerificationMethod["BIOMETRIC"] = "BIOMETRIC";
    VerificationMethod["MANUAL"] = "MANUAL";
})(VerificationMethod || (VerificationMethod = {}));
/**
 * Challan Status Transition Map
 */
export const VALID_STATUS_TRANSITIONS = {
    [EChallanStatus.DRAFT]: [EChallanStatus.OTP_SENT, EChallanStatus.CANCELLED],
    [EChallanStatus.OTP_SENT]: [EChallanStatus.OTP_VERIFIED, EChallanStatus.CANCELLED],
    [EChallanStatus.OTP_VERIFIED]: [EChallanStatus.BUYER_SIGNED, EChallanStatus.CANCELLED],
    [EChallanStatus.BUYER_SIGNED]: [EChallanStatus.FARMER_SIGNED, EChallanStatus.CANCELLED],
    [EChallanStatus.FARMER_SIGNED]: [EChallanStatus.COMPLETED, EChallanStatus.CANCELLED],
    [EChallanStatus.COMPLETED]: [EChallanStatus.ARCHIVED],
    [EChallanStatus.ARCHIVED]: [],
    [EChallanStatus.CANCELLED]: [],
};
/**
 * Error Types
 */
export class EChallanError extends Error {
    constructor(code, message, statusCode = 400, context) {
        super(message);
        this.code = code;
        this.statusCode = statusCode;
        this.context = context;
        this.name = 'EChallanError';
    }
}
export const EChallanErrorCodes = {
    CHALLAN_NOT_FOUND: 'CHALLAN_NOT_FOUND',
    INVALID_STATUS_TRANSITION: 'INVALID_STATUS_TRANSITION',
    OTP_INVALID: 'OTP_INVALID',
    OTP_EXPIRED: 'OTP_EXPIRED',
    OTP_MAX_ATTEMPTS_EXCEEDED: 'OTP_MAX_ATTEMPTS_EXCEEDED',
    SIGNATURE_INVALID: 'SIGNATURE_INVALID',
    TAMPER_DETECTED: 'TAMPER_DETECTED',
    PDF_GENERATION_FAILED: 'PDF_GENERATION_FAILED',
    S3_UPLOAD_FAILED: 'S3_UPLOAD_FAILED',
    INTEGRITY_CHECK_FAILED: 'INTEGRITY_CHECK_FAILED',
    ESCROW_RELEASE_FAILED: 'ESCROW_RELEASE_FAILED',
    UNAUTHORIZED: 'UNAUTHORIZED',
    INVALID_REQUEST: 'INVALID_REQUEST',
};

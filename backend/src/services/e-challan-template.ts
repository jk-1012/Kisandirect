/**
 * E-Challan PDF Template
 * HTML template for generating digital challan documents
 */

import { ChallanContentData } from '../types/e-challan';

export function getChallanTemplate(data: ChallanContentData): string {
  const formattedDate = (date: Date) => new Date(date).toLocaleDateString('en-IN', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  const itemsTotal = data.items.reduce((sum, item) => sum + item.totalPrice, 0);

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>E-Challan - ${data.challanNumber}</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    
    body {
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      color: #333;
      background: #fff;
      line-height: 1.6;
    }
    
    .container {
      max-width: 900px;
      margin: 0 auto;
      padding: 40px;
      background: white;
    }
    
    .header {
      text-align: center;
      border-bottom: 3px solid #2c3e50;
      padding-bottom: 20px;
      margin-bottom: 30px;
    }
    
    .header h1 {
      font-size: 32px;
      color: #2c3e50;
      margin-bottom: 10px;
      text-transform: uppercase;
      letter-spacing: 2px;
    }
    
    .challan-number {
      font-size: 14px;
      color: #666;
      font-weight: 600;
    }
    
    .qr-code-section {
      text-align: center;
      margin-bottom: 30px;
      padding: 20px;
      background: #f7f7f7;
      border-radius: 8px;
    }
    
    .qr-code-section img {
      max-width: 200px;
      height: auto;
    }
    
    .qr-text {
      font-size: 12px;
      color: #666;
      margin-top: 10px;
    }
    
    .parties {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 30px;
      margin-bottom: 40px;
      page-break-inside: avoid;
    }
    
    .party {
      border: 1px solid #ddd;
      padding: 20px;
      border-radius: 6px;
    }
    
    .party-title {
      font-size: 14px;
      font-weight: 700;
      color: #2c3e50;
      margin-bottom: 15px;
      text-transform: uppercase;
      border-bottom: 2px solid #3498db;
      padding-bottom: 10px;
    }
    
    .party-field {
      margin-bottom: 10px;
      font-size: 13px;
    }
    
    .party-field strong {
      color: #2c3e50;
      display: inline-block;
      width: 100px;
    }
    
    .party-field span {
      color: #555;
      word-break: break-word;
    }
    
    table {
      width: 100%;
      border-collapse: collapse;
      margin: 30px 0;
      page-break-inside: avoid;
    }
    
    table thead {
      background: #2c3e50;
      color: white;
    }
    
    table th {
      padding: 12px;
      text-align: left;
      font-weight: 600;
      border: 1px solid #ddd;
      font-size: 13px;
    }
    
    table td {
      padding: 12px;
      border: 1px solid #ddd;
      font-size: 12px;
    }
    
    table tbody tr:nth-child(even) {
      background: #f9f9f9;
    }
    
    .text-right {
      text-align: right;
    }
    
    .totals-section {
      margin-top: 20px;
      display: flex;
      justify-content: flex-end;
    }
    
    .totals-table {
      width: 350px;
    }
    
    .totals-table td {
      padding: 10px 15px;
      border: 1px solid #ddd;
      font-size: 13px;
    }
    
    .totals-table td:first-child {
      background: #f5f5f5;
      font-weight: 600;
      width: 70%;
    }
    
    .totals-table td:last-child {
      text-align: right;
      font-weight: 600;
    }
    
    .total-amount {
      background: #2c3e50 !important;
      color: white;
      font-weight: 700;
      font-size: 14px;
    }
    
    .signatures-section {
      margin-top: 60px;
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 40px;
      page-break-inside: avoid;
    }
    
    .signature-block {
      text-align: center;
    }
    
    .signature-label {
      font-size: 12px;
      color: #666;
      margin-bottom: 40px;
      display: block;
    }
    
    .signature-line {
      border-top: 2px solid #333;
      margin: 40px 0 10px 0;
      padding-top: 10px;
    }
    
    .signature-name {
      font-size: 12px;
      font-weight: 600;
      color: #333;
    }
    
    .terms {
      margin-top: 40px;
      padding: 20px;
      background: #f0f0f0;
      border-left: 4px solid #3498db;
      font-size: 11px;
      line-height: 1.8;
      color: #555;
    }
    
    .terms h4 {
      color: #2c3e50;
      margin-bottom: 10px;
      font-size: 12px;
    }
    
    .terms ul {
      list-style-position: inside;
      margin-left: 10px;
    }
    
    .terms li {
      margin-bottom: 5px;
    }
    
    .footer {
      text-align: center;
      margin-top: 40px;
      padding-top: 20px;
      border-top: 1px solid #ddd;
      font-size: 11px;
      color: #999;
    }
    
    .stamp {
      text-align: center;
      font-size: 12px;
      color: #999;
      margin-top: 20px;
    }
    
    @media print {
      body {
        margin: 0;
        padding: 0;
      }
      .container {
        margin: 0;
        padding: 20px;
        max-width: 100%;
      }
      .parties {
        page-break-inside: avoid;
      }
      table {
        page-break-inside: avoid;
      }
      .signatures-section {
        page-break-inside: avoid;
      }
    }
  </style>
</head>
<body>
  <div class="container">
    <!-- Header -->
    <div class="header">
      <h1>📋 E-Challan</h1>
      <div class="challan-number">Challan #${data.challanNumber}</div>
    </div>
    
    <!-- QR Code Section -->
    <div class="qr-code-section">
      <img src="${data.qrCode}" alt="QR Code" />
      <div class="qr-text">Scan QR code to verify authenticity</div>
    </div>
    
    <!-- Parties Information -->
    <div class="parties">
      <div class="party">
        <div class="party-title">Seller (Farmer)</div>
        <div class="party-field"><strong>Name:</strong> <span>${data.farmerName}</span></div>
        <div class="party-field"><strong>Phone:</strong> <span>${data.farmerPhone}</span></div>
        <div class="party-field"><strong>Email:</strong> <span>${data.farmerEmail}</span></div>
        ${data.farmerGSTIN ? `<div class="party-field"><strong>GSTIN:</strong> <span>${data.farmerGSTIN}</span></div>` : ''}
        <div class="party-field"><strong>Address:</strong> <span>${data.farmerAddress}</span></div>
      </div>
      
      <div class="party">
        <div class="party-title">Buyer</div>
        <div class="party-field"><strong>Name:</strong> <span>${data.buyerName}</span></div>
        <div class="party-field"><strong>Phone:</strong> <span>${data.buyerPhone}</span></div>
        <div class="party-field"><strong>Email:</strong> <span>${data.buyerEmail}</span></div>
        <div class="party-field"><strong>Address:</strong> <span>${data.buyerAddress}</span></div>
      </div>
    </div>
    
    <!-- Order Details -->
    <div>
      <h3 style="margin: 20px 0 10px 0; color: #2c3e50; font-size: 16px;">Order Details</h3>
      <table>
        <thead>
          <tr>
            <th>Order ID</th>
            <th>Order Date</th>
            <th>Delivery Date</th>
            <th>Est. Delivery</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>${data.orderId}</td>
            <td>${formattedDate(data.orderDate)}</td>
            <td>${formattedDate(data.deliveryDate)}</td>
            <td>${formattedDate(data.estimatedDeliveryDate)}</td>
          </tr>
        </tbody>
      </table>
    </div>
    
    <!-- Items Table -->
    <div>
      <h3 style="margin: 20px 0 10px 0; color: #2c3e50; font-size: 16px;">Products</h3>
      <table>
        <thead>
          <tr>
            <th>Product Name</th>
            <th text-align: right;">Qty</th>
            <th>Unit</th>
            <th class="text-right">Unit Price</th>
            <th class="text-right">Total</th>
          </tr>
        </thead>
        <tbody>
          ${data.items.map(item => `
            <tr>
              <td>${item.name}</td>
              <td style="text-align: right;">${item.quantity}</td>
              <td>${item.unit}</td>
              <td class="text-right">₹${item.pricePerUnit.toFixed(2)}</td>
              <td class="text-right">₹${item.totalPrice.toFixed(2)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
    
    <!-- Totals -->
    <div class="totals-section">
      <table class="totals-table">
        <tr>
          <td>Subtotal:</td>
          <td>₹${data.subtotal.toFixed(2)}</td>
        </tr>
        <tr>
          <td>Tax (18%):</td>
          <td>₹${data.tax.toFixed(2)}</td>
        </tr>
        <tr class="total-amount">
          <td>TOTAL AMOUNT:</td>
          <td>₹${data.total.toFixed(2)}</td>
        </tr>
      </table>
    </div>
    
    <!-- Additional Info -->
    <div style="margin-top: 30px; padding: 15px; background: #f9f9f9; border-radius: 6px;">
      <div style="margin-bottom: 10px; font-size: 13px;">
        <strong>Payment Method:</strong> ${data.paymentMethod}
      </div>
      <div style="font-size: 13px;">
        <strong>Delivery Method:</strong> ${data.deliveryMethod}
      </div>
      ${data.notes ? `<div style="margin-top: 10px; font-size: 13px;"><strong>Notes:</strong> ${data.notes}</div>` : ''}
    </div>
    
    <!-- Signature Section -->
    <div class="signatures-section">
      <div class="signature-block">
        <span class="signature-label">Farmer's Signature / Thumb Impression</span>
        <div class="signature-line"></div>
        <div class="signature-name">${data.farmerName}</div>
      </div>
      <div class="signature-block">
        <span class="signature-label">Buyer's Signature / Stamp</span>
        <div class="signature-line"></div>
        <div class="signature-name">${data.buyerName}</div>
      </div>
    </div>
    
    <!-- Terms and Conditions -->
    <div class="terms">
      <h4>Terms & Conditions:</h4>
      <ul>
        <li>Payment will be released via escrow upon digital signature by both parties</li>
        <li>This is a legally binding digital document as per IT Act 2000</li>
        <li>Any tampering with this document is illegal and will be prosecuted</li>
        <li>All disputes will be resolved through the Kisandirect dispute management system</li>
        <li>Seller warrants that goods are as described and free from defects</li>
        <li>Buyer has 48 hours to report any discrepancies</li>
      </ul>
    </div>
    
    <!-- Document Verification Info -->
    <div class="stamp">
      <strong>Document Verification:</strong><br />
      Challan ID: ${data.challanNumber}<br />
      Generated: ${formattedDate(new Date())}<br />
      <em>This document is digitally signed and tamper-proof</em>
    </div>
    
    <!-- Footer -->
    <div class="footer">
      <p>© ${new Date().getFullYear()} Kisandirect. All rights reserved.</p>
      <p>This electronic record is generated by a computer system and does not require a physical signature.</p>
    </div>
  </div>
</body>
</html>
  `;
}

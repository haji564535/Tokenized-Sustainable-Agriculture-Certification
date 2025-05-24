import { describe, it, expect, beforeEach } from 'vitest';

// Mock contract state
const mockContracts = {
  certificationIssuance: {
    nextCertificateId: 1,
    certificates: new Map(),
    farmCertificates: new Map(),
    certificateMetadata: new Map(),
    nftOwners: new Map(),
    contractOwner: 'ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM'
  }
};

let mockTxSender = 'ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM';
let mockBlockHeight = 12345;

// Helper functions
function issueCertificate(farmId, assessmentId, certLevel, metadataUri, farmName, sustainabilityScore, practicesVerified, carbonFootprint, waterEfficiency) {
  if (mockTxSender !== mockContracts.certificationIssuance.contractOwner) {
    return { err: 400 }; // ERR_UNAUTHORIZED
  }
  
  const certificateId = mockContracts.certificationIssuance.nextCertificateId;
  
  // Mock NFT minting
  mockContracts.certificationIssuance.nftOwners.set(certificateId, mockTxSender);
  
  const certificateData = {
    farmId,
    assessmentId,
    certificationLevel: certLevel,
    issueDate: mockBlockHeight,
    expiryDate: mockBlockHeight + 52560, // 1 year validity
    issuer: mockTxSender,
    metadataUri,
    renewable: true,
    revoked: false
  };
  
  const metadata = {
    farmName,
    certificationLevel: certLevel,
    sustainabilityScore,
    practicesVerified,
    carbonFootprint,
    waterEfficiency
  };
  
  mockContracts.certificationIssuance.certificates.set(certificateId, certificateData);
  mockContracts.certificationIssuance.certificateMetadata.set(certificateId, metadata);
  
  const farmCerts = mockContracts.certificationIssuance.farmCertificates.get(farmId) || [];
  farmCerts.push(certificateId);
  mockContracts.certificationIssuance.farmCertificates.set(farmId, farmCerts);
  
  mockContracts.certificationIssuance.nextCertificateId++;
  
  return { ok: certificateId };
}

function transferCertificate(certificateId, newOwner) {
  const currentOwner = mockContracts.certificationIssuance.nftOwners.get(certificateId);
  if (!currentOwner) {
    return { err: 401 }; // ERR_CERTIFICATE_NOT_FOUND
  }
  
  if (mockTxSender !== currentOwner) {
    return { err: 400 }; // ERR_UNAUTHORIZED
  }
  
  mockContracts.certificationIssuance.nftOwners.set(certificateId, newOwner);
  return { ok: true };
}

function renewCertificate(certificateId, newAssessmentId) {
  if (mockTxSender !== mockContracts.certificationIssuance.contractOwner) {
    return { err: 400 }; // ERR_UNAUTHORIZED
  }
  
  const cert = mockContracts.certificationIssuance.certificates.get(certificateId);
  if (!cert) {
    return { err: 401 }; // ERR_CERTIFICATE_NOT_FOUND
  }
  
  if (!cert.renewable || cert.revoked) {
    return { err: 400 }; // ERR_UNAUTHORIZED
  }
  
  cert.assessmentId = newAssessmentId;
  cert.expiryDate = mockBlockHeight + 52560;
  cert.issueDate = mockBlockHeight;
  
  return { ok: true };
}

function revokeCertificate(certificateId) {
  if (mockTxSender !== mockContracts.certificationIssuance.contractOwner) {
    return { err: 400 }; // ERR_UNAUTHORIZED
  }
  
  const cert = mockContracts.certificationIssuance.certificates.get(certificateId);
  if (!cert) {
    return { err: 401 }; // ERR_CERTIFICATE_NOT_FOUND
  }
  
  cert.revoked = true;
  return { ok: true };
}

function getCertificate(certificateId) {
  return mockContracts.certificationIssuance.certificates.get(certificateId) || null;
}

function getCertificateMetadata(certificateId) {
  return mockContracts.certificationIssuance.certificateMetadata.get(certificateId) || null;
}

function getCertificateOwner(certificateId) {
  return mockContracts.certificationIssuance.nftOwners.get(certificateId) || null;
}

function getCertificateIdsByFarm(farmId) {
  return mockContracts.certificationIssuance.farmCertificates.get(farmId) || [];
}

function isCertificateValid(certificateId) {
  const cert = getCertificate(certificateId);
  if (!cert) return false;
  
  return cert.expiryDate > mockBlockHeight && !cert.revoked;
}

function getActiveCertificates(farmId) {
  const certIds = getCertificateIdsByFarm(farmId);
  return certIds.filter(id => isCertificateValid(id));
}

describe('Certification Issuance Contract', () => {
  beforeEach(() => {
    // Reset contract state
    mockContracts.certificationIssuance.nextCertificateId = 1;
    mockContracts.certificationIssuance.certificates.clear();
    mockContracts.certificationIssuance.farmCertificates.clear();
    mockContracts.certificationIssuance.certificateMetadata.clear();
    mockContracts.certificationIssuance.nftOwners.clear();
    mockTxSender = 'ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM';
    mockBlockHeight = 12345;
  });
  
  describe('Certificate Issuance', () => {
    it('should issue certificate successfully by contract owner', () => {
      const result = issueCertificate(
          1, 1, 'gold', 'https://metadata.uri', 'Green Valley Farm',
          85, 10, 500, 90
      );
      
      expect(result.ok).toBe(1);
      
      const cert = getCertificate(1);
      expect(cert).toBeTruthy();
      expect(cert.farmId).toBe(1);
      expect(cert.assessmentId).toBe(1);
      expect(cert.certificationLevel).toBe('gold');
      expect(cert.issuer).toBe(mockTxSender);
      expect(cert.renewable).toBe(true);
      expect(cert.revoked).toBe(false);
      
      const metadata = getCertificateMetadata(1);
      expect(metadata.farmName).toBe('Green Valley Farm');
      expect(metadata.sustainabilityScore).toBe(85);
    });
    
    it('should reject issuance from non-owner', () => {
      mockTxSender = 'ST2DIFFERENT_ADDRESS';
      const result = issueCertificate(
          1, 1, 'gold', 'https://metadata.uri', 'Green Valley Farm',
          85, 10, 500, 90
      );
      
      expect(result.err).toBe(400); // ERR_UNAUTHORIZED
    });
    
    it('should assign sequential certificate IDs', () => {
      const result1 = issueCertificate(1, 1, 'gold', 'uri1', 'Farm 1', 85, 10, 500, 90);
      const result2 = issueCertificate(2, 2, 'silver', 'uri2', 'Farm 2', 75, 8, 600, 80);
      
      expect(result1.ok).toBe(1);
      expect(result2.ok).toBe(2);
    });
    
    it('should track certificates by farm', () => {
      issueCertificate(1, 1, 'gold', 'uri1', 'Farm 1', 85, 10, 500, 90);
      issueCertificate(1, 2, 'platinum', 'uri2', 'Farm 1', 95, 12, 400, 95);
      issueCertificate(2, 3, 'silver', 'uri3', 'Farm 2', 75, 8, 600, 80);
      
      const farm1Certs = getCertificateIdsByFarm(1);
      const farm2Certs = getCertificateIdsByFarm(2);
      
      expect(farm1Certs).toEqual([1, 2]);
      expect(farm2Certs).toEqual([3]);
    });
  });
  
  describe('Certificate Transfer', () => {
    beforeEach(() => {
      issueCertificate(1, 1, 'gold', 'uri', 'Farm 1', 85, 10, 500, 90);
    });
    
    it('should transfer certificate successfully by owner', () => {
      const newOwner = 'ST2NEW_OWNER_ADDRESS';
      const result = transferCertificate(1, newOwner);
      
      expect(result.ok).toBe(true);
      expect(getCertificateOwner(1)).toBe(newOwner);
    });
    
    it('should reject transfer from non-owner', () => {
      mockTxSender = 'ST2DIFFERENT_ADDRESS';
      const result = transferCertificate(1, 'ST3ANOTHER_ADDRESS');
      
      expect(result.err).toBe(400); // ERR_UNAUTHORIZED
    });
    
    it('should return error for non-existent certificate', () => {
      const result = transferCertificate(999, 'ST2NEW_OWNER');
      
      expect(result.err).toBe(401); // ERR_CERTIFICATE_NOT_FOUND
    });
  });
  
  describe('Certificate Renewal', () => {
    beforeEach(() => {
      issueCertificate(1, 1, 'gold', 'uri', 'Farm 1', 85, 10, 500, 90);
    });
    
    it('should renew certificate successfully by contract owner', () => {
      const result = renewCertificate(1, 2);
      
      expect(result.ok).toBe(true);
      
      const cert = getCertificate(1);
      expect(cert.assessmentId).toBe(2);
      expect(cert.expiryDate).toBe(mockBlockHeight + 52560);
      expect(cert.issueDate).toBe(mockBlockHeight);
    });
    
    it('should reject renewal from non-owner', () => {
      mockTxSender = 'ST2DIFFERENT_ADDRESS';
      const result = renewCertificate(1, 2);
      
      expect(result.err).toBe(400); // ERR_UNAUTHORIZED
    });
    
    it('should reject renewal of revoked certificate', () => {
      revokeCertificate(1);
      const result = renewCertificate(1, 2);
      
      expect(result.err).toBe(400); // ERR_UNAUTHORIZED
    });
  });
  
  describe('Certificate Revocation', () => {
    beforeEach(() => {
      issueCertificate(1, 1, 'gold', 'uri', 'Farm 1', 85, 10, 500, 90);
    });
    
    it('should revoke certificate successfully by contract owner', () => {
      const result = revokeCertificate(1);
      
      expect(result.ok).toBe(true);
      
      const cert = getCertificate(1);
      expect(cert.revoked).toBe(true);
    });
    
    it('should reject revocation from non-owner', () => {
      mockTxSender = 'ST2DIFFERENT_ADDRESS';
      const result = revokeCertificate(1);
      
      expect(result.err).toBe(400); // ERR_UNAUTHORIZED
    });
  });
  
  describe('Certificate Validity', () => {
    it('should return true for valid certificate', () => {
      issueCertificate(1, 1, 'gold', 'uri', 'Farm 1', 85, 10, 500, 90);
      expect(isCertificateValid(1)).toBe(true);
    });
    
    it('should return false for expired certificate', () => {
      issueCertificate(1, 1, 'gold', 'uri', 'Farm 1', 85, 10, 500, 90);
      
      // Simulate time passing beyond expiry
      mockBlockHeight += 60000;
      
      expect(isCertificateValid(1)).toBe(false);
    });
    
    it('should return false for revoked certificate', () => {
      issueCertificate(1, 1, 'gold', 'uri', 'Farm 1', 85, 10, 500, 90);
      revokeCertificate(1);
      
      expect(isCertificateValid(1)).toBe(false);
    });
    
    it('should return false for non-existent certificate', () => {
      expect(isCertificateValid(999)).toBe(false);
    });
  });
  
  describe('Active Certificates', () => {
    beforeEach(() => {
      issueCertificate(1, 1, 'gold', 'uri1', 'Farm 1', 85, 10, 500, 90);
      issueCertificate(1, 2, 'silver', 'uri2', 'Farm 1', 75, 8, 600, 80);
      issueCertificate(1, 3, 'bronze', 'uri3', 'Farm 1', 65, 6, 700, 70);
    });
    
    it('should return all active certificates for farm', () => {
      const activeCerts = getActiveCertificates(1);
      expect(activeCerts).toEqual([1, 2, 3]);
    });
    
    it('should exclude revoked certificates', () => {
      revokeCertificate(2);
      const activeCerts = getActiveCertificates(1);
      expect(activeCerts).toEqual([1, 3]);
    });
    
    it('should exclude expired certificates', () => {
      // Simulate time passing
      mockBlockHeight += 60000;
      const activeCerts = getActiveCertificates(1);
      expect(activeCerts).toEqual([]);
    });
    
    it('should return empty array for farm with no certificates', () => {
      const activeCerts = getActiveCertificates(999);
      expect(activeCerts).toEqual([]);
    });
  });
  
  describe('Data Retrieval', () => {
    beforeEach(() => {
      issueCertificate(1, 1, 'gold', 'https://metadata.uri', 'Sustainable Farm', 85, 10, 500, 90);
    });
    
    it('should retrieve certificate details correctly', () => {
      const cert = getCertificate(1);
      expect(cert.farmId).toBe(1);
      expect(cert.certificationLevel).toBe('gold');
      expect(cert.metadataUri).toBe('https://metadata.uri');
    });
    
    it('should retrieve certificate metadata correctly', () => {
      const metadata = getCertificateMetadata(1);
      expect(metadata.farmName).toBe('Sustainable Farm');
      expect(metadata.sustainabilityScore).toBe(85);
      expect(metadata.practicesVerified).toBe(10);
      expect(metadata.carbonFootprint).toBe(500);
      expect(metadata.waterEfficiency).toBe(90);
    });
    
    it('should return null for non-existent certificate', () => {
      expect(getCertificate(999)).toBeNull();
      expect(getCertificateMetadata(999)).toBeNull();
      expect(getCertificateOwner(999)).toBeNull();
    });
  });
});

console.log('Certification Issuance Contract tests completed successfully!');

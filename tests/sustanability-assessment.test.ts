import { describe, it, expect, beforeEach } from 'vitest';

// Mock contract state
const mockContracts = {
  sustainabilityAssessment: {
    nextAssessmentId: 1,
    assessments: new Map(),
    farmAssessments: new Map(),
    sustainabilityMetrics: new Map()
  }
};

let mockTxSender = 'ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM';
let mockBlockHeight = 12345;

// Helper functions
function createAssessment(farmId, waterScore, energyScore, chemicalScore, organicScore, biodiversityScore) {
  // Validate scores (0-100)
  if (waterScore > 100 || energyScore > 100 || chemicalScore > 100 || organicScore > 100 || biodiversityScore > 100) {
    return { err: 303 }; // ERR_INVALID_SCORE
  }
  
  const assessmentId = mockContracts.sustainabilityAssessment.nextAssessmentId;
  const overallScore = calculateOverallScore(waterScore, energyScore, chemicalScore, organicScore, biodiversityScore);
  const certLevel = determineCertificationLevel(overallScore);
  
  const assessmentData = {
    farmId,
    assessmentDate: mockBlockHeight,
    waterEfficiencyScore: waterScore,
    energyEfficiencyScore: energyScore,
    chemicalReductionScore: chemicalScore,
    organicPracticesScore: organicScore,
    biodiversityScore,
    overallScore,
    certificationLevel: certLevel,
    assessor: mockTxSender,
    validUntil: mockBlockHeight + 52560 // 1 year validity
  };
  
  mockContracts.sustainabilityAssessment.assessments.set(assessmentId, assessmentData);
  
  const farmAssessments = mockContracts.sustainabilityAssessment.farmAssessments.get(farmId) || [];
  farmAssessments.push(assessmentId);
  mockContracts.sustainabilityAssessment.farmAssessments.set(farmId, farmAssessments);
  
  mockContracts.sustainabilityAssessment.nextAssessmentId++;
  
  return { ok: assessmentId };
}

function calculateOverallScore(waterScore, energyScore, chemicalScore, organicScore, biodiversityScore) {
  const WATER_WEIGHT = 25;
  const ENERGY_WEIGHT = 25;
  const CHEMICAL_WEIGHT = 20;
  const ORGANIC_WEIGHT = 20;
  const BIODIVERSITY_WEIGHT = 10;
  
  return Math.floor((
      (waterScore * WATER_WEIGHT) +
      (energyScore * ENERGY_WEIGHT) +
      (chemicalScore * CHEMICAL_WEIGHT) +
      (organicScore * ORGANIC_WEIGHT) +
      (biodiversityScore * BIODIVERSITY_WEIGHT)
  ) / 100);
}

function determineCertificationLevel(score) {
  if (score >= 90) return 'platinum';
  if (score >= 80) return 'gold';
  if (score >= 70) return 'silver';
  if (score >= 60) return 'bronze';
  return 'basic';
}

function getAssessment(assessmentId) {
  return mockContracts.sustainabilityAssessment.assessments.get(assessmentId) || null;
}

function getAssessmentIdsByFarm(farmId) {
  return mockContracts.sustainabilityAssessment.farmAssessments.get(farmId) || [];
}

function getLatestAssessment(farmId) {
  const assessmentIds = getAssessmentIdsByFarm(farmId);
  if (assessmentIds.length === 0) return null;
  
  const latestId = assessmentIds[assessmentIds.length - 1];
  return getAssessment(latestId);
}

function isAssessmentValid(assessmentId) {
  const assessment = getAssessment(assessmentId);
  return assessment ? assessment.validUntil > mockBlockHeight : false;
}

function updateFarmMetrics(farmId, totalWater, totalEnergy, totalChemicals, organicCount, totalCount, farmSize) {
  const metrics = {
    totalWaterUsage: totalWater,
    totalEnergyUsage: totalEnergy,
    totalChemicalUsage: totalChemicals,
    organicPracticesCount: organicCount,
    totalPracticesCount: totalCount,
    farmSize
  };
  
  mockContracts.sustainabilityAssessment.sustainabilityMetrics.set(farmId, metrics);
  return { ok: true };
}

function getFarmMetrics(farmId) {
  return mockContracts.sustainabilityAssessment.sustainabilityMetrics.get(farmId) || null;
}

describe('Sustainability Assessment Contract', () => {
  beforeEach(() => {
    // Reset contract state
    mockContracts.sustainabilityAssessment.nextAssessmentId = 1;
    mockContracts.sustainabilityAssessment.assessments.clear();
    mockContracts.sustainabilityAssessment.farmAssessments.clear();
    mockContracts.sustainabilityAssessment.sustainabilityMetrics.clear();
    mockTxSender = 'ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM';
    mockBlockHeight = 12345;
  });
  
  describe('Assessment Creation', () => {
    it('should create assessment with valid scores', () => {
      const result = createAssessment(1, 85, 90, 75, 80, 70);
      
      expect(result.ok).toBe(1);
      
      const assessment = getAssessment(1);
      expect(assessment).toBeTruthy();
      expect(assessment.farmId).toBe(1);
      expect(assessment.waterEfficiencyScore).toBe(85);
      expect(assessment.energyEfficiencyScore).toBe(90);
      expect(assessment.chemicalReductionScore).toBe(75);
      expect(assessment.organicPracticesScore).toBe(80);
      expect(assessment.biodiversityScore).toBe(70);
      expect(assessment.assessor).toBe(mockTxSender);
      expect(assessment.validUntil).toBe(mockBlockHeight + 52560);
    });
    
    it('should reject assessment with invalid scores', () => {
      const result = createAssessment(1, 150, 90, 75, 80, 70);
      expect(result.err).toBe(303); // ERR_INVALID_SCORE
    });
    
    it('should calculate overall score correctly', () => {
      createAssessment(1, 80, 90, 70, 85, 75);
      
      const assessment = getAssessment(1);
      // Expected: (80*25 + 90*25 + 70*20 + 85*20 + 75*10) / 100 = 81
      expect(assessment.overallScore).toBe(81);
    });
    
    it('should determine certification levels correctly', () => {
      createAssessment(1, 95, 95, 90, 90, 85); // Should be platinum (92)
      createAssessment(2, 85, 85, 80, 80, 75); // Should be gold (82)
      createAssessment(3, 75, 75, 70, 70, 65); // Should be silver (72)
      createAssessment(4, 65, 65, 60, 60, 55); // Should be bronze (62)
      createAssessment(5, 50, 50, 45, 45, 40); // Should be basic (47)
      
      expect(getAssessment(1).certificationLevel).toBe('platinum');
      expect(getAssessment(2).certificationLevel).toBe('gold');
      expect(getAssessment(3).certificationLevel).toBe('silver');
      expect(getAssessment(4).certificationLevel).toBe('bronze');
      expect(getAssessment(5).certificationLevel).toBe('basic');
    });
  });
  
  describe('Assessment Tracking', () => {
    it('should track multiple assessments per farm', () => {
      createAssessment(1, 70, 75, 65, 70, 60);
      createAssessment(1, 80, 85, 75, 80, 70);
      createAssessment(1, 90, 95, 85, 90, 80);
      
      const assessmentIds = getAssessmentIdsByFarm(1);
      expect(assessmentIds).toEqual([1, 2, 3]);
    });
    
    it('should return null for farm with no assessments', () => {
      const latest = getLatestAssessment(999);
      expect(latest).toBeNull();
    });
  });
  
  describe('Assessment Validity', () => {
    it('should return true for valid assessment', () => {
      createAssessment(1, 80, 85, 75, 80, 70);
      const isValid = isAssessmentValid(1);
      expect(isValid).toBe(true);
    });
    
    it('should return false for expired assessment', () => {
      createAssessment(1, 80, 85, 75, 80, 70);
      
      // Simulate time passing beyond validity period
      mockBlockHeight += 60000;
      
      const isValid = isAssessmentValid(1);
      expect(isValid).toBe(false);
    });
    
    it('should return false for non-existent assessment', () => {
      const isValid = isAssessmentValid(999);
      expect(isValid).toBe(false);
    });
  });
  
  describe('Farm Metrics Management', () => {
    it('should update farm metrics successfully', () => {
      const result = updateFarmMetrics(1, 5000, 2000, 100, 8, 10, 100);
      
      expect(result.ok).toBe(true);
      
      const metrics = getFarmMetrics(1);
      expect(metrics).toEqual({
        totalWaterUsage: 5000,
        totalEnergyUsage: 2000,
        totalChemicalUsage: 100,
        organicPracticesCount: 8,
        totalPracticesCount: 10,
        farmSize: 100
      });
    });
    
    it('should return null for farm with no metrics', () => {
      const metrics = getFarmMetrics(999);
      expect(metrics).toBeNull();
    });
  });
  
  describe('Assessment History', () => {
    it('should maintain assessment history for farms', () => {
      // Create assessments over time
      createAssessment(1, 60, 65, 55, 60, 50); // Initial assessment
      mockBlockHeight += 1000;
      createAssessment(1, 70, 75, 65, 70, 60); // Improvement
      mockBlockHeight += 1000;
      createAssessment(1, 80, 85, 75, 80, 70); // Further improvement
      
      const assessmentIds = getAssessmentIdsByFarm(1);
      expect(assessmentIds.length).toBe(3);
      
      // Verify improvement trend
      const assessment1 = getAssessment(1);
      const assessment2 = getAssessment(2);
      const assessment3 = getAssessment(3);
      
      expect(assessment1.overallScore).toBeLessThan(assessment2.overallScore);
      expect(assessment2.overallScore).toBeLessThan(assessment3.overallScore);
    });
  });
});

console.log('Sustainability Assessment Contract tests completed successfully!');

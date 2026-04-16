/**
 * Deterministic Matching Engine for Job Fit Analysis
 * Implements SC1, SC2, and SC3 rules.
 */

export type MatchStatus = 'Good Fit' | 'Not Good Fit' | 'EXP > Resume exp' | 'Needs Manual Review';

export interface MatchResult {
  status: MatchStatus;
  isGoodFit: boolean;
  reason: string;
  scenario: 'SC1' | 'SC2' | 'SC3' | 'Standard' | 'N/A';
  detectedJdExp: number;
  candidateRoleExp: number;
}

/**
 * Calculates the fit between a JD's experience requirement and a candidate's profile.
 * 
 * Rules:
 * SC1: If JD says 5-7+ and candidate has 5, accept it. If candidate has 4, mark as "EXP > Resume exp".
 * SC2: If JD says 5+ in target role and candidate has 3, mark "Not Good Fit".
 * SC3: Prioritize target-role-specific experience over overall IT experience.
 */
export function calculateJobFit(
  jdMinExp: number, 
  candidateRoleExp: number, 
  candidateTotalExp: number
): MatchResult {
  // SC3: We always use candidateRoleExp for the primary comparison as per requirements
  const effectiveExp = candidateRoleExp;
  
  if (isNaN(jdMinExp) || jdMinExp < 0) {
    return {
      status: 'Needs Manual Review',
      isGoodFit: false,
      reason: 'Could not clearly determine minimum experience required from JD.',
      scenario: 'N/A',
      detectedJdExp: jdMinExp,
      candidateRoleExp: effectiveExp
    };
  }

  const gap = jdMinExp - effectiveExp;

  // SC1: If JD says 5-7 and candidate has 5, accept it (gap <= 0)
  if (gap <= 0) {
    return {
      status: 'Good Fit',
      isGoodFit: true,
      reason: `Candidate meets or exceeds the requirement of ${jdMinExp} years.`,
      scenario: 'Standard',
      detectedJdExp: jdMinExp,
      candidateRoleExp: effectiveExp
    };
  }

  // SC1: If JD says 5-7 and candidate has 4, mark as "EXP > Resume exp" (gap == 1)
  if (gap === 1) {
    return {
      status: 'EXP > Resume exp',
      isGoodFit: false,
      reason: `JD requires ${jdMinExp} years, but candidate has ${effectiveExp} years (1 year gap).`,
      scenario: 'SC1',
      detectedJdExp: jdMinExp,
      candidateRoleExp: effectiveExp
    };
  }

  // SC2: If gap > 1, mark "Not Good Fit"
  return {
    status: 'Not Good Fit',
    isGoodFit: false,
    reason: `Significant experience gap: JD requires ${jdMinExp} years, candidate has ${effectiveExp} years.`,
    scenario: 'SC2',
    detectedJdExp: jdMinExp,
    candidateRoleExp: effectiveExp
  };
}

use sha3::{Digest, Keccak256};

pub struct CommitmentScheme;

impl CommitmentScheme {
    /// Computes blind commitment H(institution_id, salt)
    pub fn compute_commitment(institution_id: &str, salt: &str) -> [u8; 32] {
        let mut hasher = Keccak256::new();
        hasher.update(institution_id.as_bytes());
        hasher.update(salt.as_bytes());
        let result = hasher.finalize();
        let mut output = [0u8; 32];
        output.copy_from_slice(&result);
        output
    }

    /// Computes Merkle state root for zkVerify aggregation
    pub fn compute_merkle_root(leaf_commitments: &[[u8; 32]]) -> [u8; 32] {
        if leaf_commitments.is_empty() {
            return [0u8; 32];
        }
        if leaf_commitments.len() == 1 {
            return leaf_commitments[0];
        }

        let mut current_level = leaf_commitments.to_vec();
        while current_level.len() > 1 {
            let mut next_level = Vec::new();
            for chunk in current_level.chunks(2) {
                let mut hasher = Keccak256::new();
                hasher.update(&chunk[0]);
                if chunk.len() > 1 {
                    hasher.update(&chunk[1]);
                } else {
                    hasher.update(&chunk[0]); // Duplicate for odd trees
                }
                let mut parent = [0u8; 32];
                parent.copy_from_slice(&hasher.finalize());
                next_level.push(parent);
            }
            current_level = next_level;
        }

        current_level[0]
    }

    /// Computes aggregation ID for zkVerify verifyProofAggregation
    pub fn compute_aggregation_id(commitment: &[u8; 32], nonce: u64) -> [u8; 32] {
        let mut hasher = Keccak256::new();
        hasher.update(commitment);
        hasher.update(&nonce.to_be_bytes());
        let mut output = [0u8; 32];
        output.copy_from_slice(&hasher.finalize());
        output
    }
}

use std::collections::HashMap;
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct CreditPosition {
    pub commitment: [u8; 32],
    pub institution_id: String,
    pub collateral_asset: String,
    pub collateral_amount: u128,
    pub debt_asset: String,
    pub debt_amount: u128,
    pub liquidation_threshold_bps: u64, // e.g. 8000 = 80.00%
    pub is_liquidated: bool,
}

pub struct CreditStateLedger {
    positions: HashMap<[u8; 32], CreditPosition>,
}

impl CreditStateLedger {
    pub fn new() -> Self {
        Self {
            positions: HashMap::new(),
        }
    }

    pub fn insert_position(&mut self, position: CreditPosition) {
        self.positions.insert(position.commitment, position);
    }

    pub fn get_position(&self, commitment: &[u8; 32]) -> Option<&CreditPosition> {
        self.positions.get(commitment)
    }

    pub fn get_position_mut(&mut self, commitment: &[u8; 32]) -> Option<&mut CreditPosition> {
        self.positions.get_mut(commitment)
    }

    pub fn active_commitments(&self) -> Vec<[u8; 32]> {
        self.positions
            .values()
            .filter(|p| !p.is_liquidated)
            .map(|p| p.commitment)
            .collect()
    }
}

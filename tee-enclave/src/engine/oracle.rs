use std::collections::HashMap;

pub struct PriceOracle {
    // Prices in USD with 8 decimals (e.g. $10.00 = 1,000,000,000)
    prices: HashMap<String, u128>,
}

impl PriceOracle {
    pub fn new() -> Self {
        Self {
            prices: HashMap::new(),
        }
    }

    pub fn set_price(&mut self, asset: &str, price_usd_8_dec: u128) {
        self.prices.insert(asset.to_lowercase(), price_usd_8_dec);
    }

    pub fn get_price(&self, asset: &str) -> Option<u128> {
        self.prices.get(&asset.to_lowercase()).copied()
    }

    /// Computes the value in USD with 18 decimals:
    /// (amount_18_dec * price_8_dec) / 1e8
    pub fn compute_value_usd(&self, asset: &str, amount_18_dec: u128) -> Option<u128> {
        let price = self.get_price(asset)?;
        Some((amount_18_dec.saturating_mul(price)) / 100_000_000)
    }
}

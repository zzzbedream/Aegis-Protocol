use k256::ecdsa::{signature::Signer, Signature, SigningKey, VerifyingKey};
use sha3::{Digest, Keccak256};
use thiserror::Error;

#[derive(Error, Debug)]
pub enum AttestationError {
    #[error("Invalid key: {0}")]
    KeyError(String),
    #[error("Signing failed: {0}")]
    SigningFailed(String),
}

pub struct EnclaveSigner {
    signing_key: SigningKey,
    verifying_key: VerifyingKey,
}

impl EnclaveSigner {
    pub fn from_private_key(raw_key: &[u8; 32]) -> Result<Self, AttestationError> {
        let signing_key = SigningKey::from_bytes(raw_key.into())
            .map_err(|e| AttestationError::KeyError(e.to_string()))?;
        let verifying_key = *signing_key.verifying_key();
        Ok(Self {
            signing_key,
            verifying_key,
        })
    }

    /// Derives the Ethereum address of the Enclave Signer
    pub fn ethereum_address(&self) -> [u8; 20] {
        let uncompressed = self.verifying_key.to_encoded_point(false);
        let public_bytes = &uncompressed.as_bytes()[1..]; // Skip 0x04 prefix
        let mut hasher = Keccak256::new();
        hasher.update(public_bytes);
        let hash = hasher.finalize();
        let mut addr = [0u8; 20];
        addr.copy_from_slice(&hash[12..32]);
        addr
    }

    /// Signs an Ethereum-prefixed message hash: "\x19Ethereum Signed Message:\n32" + hash
    pub fn sign_ethereum_message(&self, message_hash: &[u8; 32]) -> Result<[u8; 65], AttestationError> {
        let mut hasher = Keccak256::new();
        hasher.update(b"\x19Ethereum Signed Message:\n32");
        hasher.update(message_hash);
        let eth_hash = hasher.finalize();

        let (signature, recovery_id) = self
            .signing_key
            .sign_recoverable(&eth_hash)
            .map_err(|e| AttestationError::SigningFailed(e.to_string()))?;

        let mut sig_bytes = [0u8; 65];
        sig_bytes[0..64].copy_from_slice(signature.to_bytes().as_slice());
        sig_bytes[64] = recovery_id.to_byte() + 27; // Standard Ethereum v (27 or 28)

        Ok(sig_bytes)
    }
}

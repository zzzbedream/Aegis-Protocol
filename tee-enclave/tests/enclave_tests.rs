use aegis_tee::crypto::attestation::EnclaveSigner;
use aegis_tee::crypto::commitments::CommitmentScheme;
use aegis_tee::crypto::decrypt::{DecryptedPosition, PayloadDecryptor};
use aegis_tee::engine::credit_state::CreditPosition;
use aegis_tee::engine::liquidation::BlindLiquidationEngine;
use aegis_tee::engine::oracle::PriceOracle;
use aegis_tee::vsocket::server::{VSocketRequest, VSocketServer};

#[test]
fn test_commitment_and_merkle_root() {
    let institution_id = "INSTITUTION_BLACKROCK_01";
    let salt = "secure_salt_8888";

    let commitment = CommitmentScheme::compute_commitment(institution_id, salt);
    assert_ne!(commitment, [0u8; 32]);

    // Same input yields same commitment
    let commitment2 = CommitmentScheme::compute_commitment(institution_id, salt);
    assert_eq!(commitment, commitment2);

    // Compute Merkle root with multiple commitments
    let commitments = vec![commitment, [0xAA; 32], [0xBB; 32], [0xCC; 32]];
    let root = CommitmentScheme::compute_merkle_root(&commitments);
    assert_ne!(root, [0u8; 32]);
}

#[test]
fn test_health_factor_and_blind_ticket_generation() {
    let private_key = [0x0B; 32];
    let signer = EnclaveSigner::from_private_key(&private_key).unwrap();

    let mut oracle = PriceOracle::new();
    // ZEN price: $10.00 (1,000,000,000 with 8 decimals)
    oracle.set_price("0xZEN", 1_000_000_000);
    // USDC price: $1.00 (100,000,000 with 8 decimals)
    oracle.set_price("0xUSDC", 100_000_000);

    let commitment = [0x11; 32];
    let position = CreditPosition {
        commitment,
        institution_id: "INST_FIDELITY".to_string(),
        collateral_asset: "0xZEN".to_string(),
        collateral_amount: 1_000 * 10u128.pow(18), // 1,000 ZEN = $10,000
        debt_asset: "0xUSDC".to_string(),
        debt_amount: 8_500 * 10u128.pow(18), // $8,500 debt
        liquidation_threshold_bps: 8000, // 80% LTV threshold => Adjusted Collat = $8,000
        is_liquidated: false,
    };

    // Adjusted collat = $8,000. Debt = $8,500 => HF = 8000/8500 = ~0.941e18 < 1.0e18 (liquidatable!)
    let hf = BlindLiquidationEngine::compute_health_factor(&position, &oracle).unwrap();
    assert!(hf < 1_000_000_000_000_000_000);

    let exitpoint_addr = [0xEE; 20];
    let ticket = BlindLiquidationEngine::evaluate_and_generate_ticket(
        &position,
        &oracle,
        &signer,
        7332, // Horizen L3 chain ID
        &exitpoint_addr,
        1700000000,
        101,
    )
    .unwrap();

    assert_eq!(ticket.commitment, format!("0x{}", hex::encode(commitment)));
    assert!(ticket.signature_hex.starts_with("0x"));
    assert_eq!(ticket.signature_hex.len(), 2 + 130); // 65 bytes in hex
}

#[test]
fn test_vsocket_server_full_flow() {
    let private_key = [0x0B; 32];
    let signer = EnclaveSigner::from_private_key(&private_key).unwrap();
    let decryptor = PayloadDecryptor::new(private_key);

    let server = VSocketServer::new(signer, decryptor);

    // 1. Ingest confidential position
    let pos_payload = DecryptedPosition {
        institution_id: "INST_01".to_string(),
        collateral_asset: "0xZEN".to_string(),
        collateral_amount: 1_000 * 10u128.pow(18),
        debt_asset: "0xUSDC".to_string(),
        debt_amount: 8_000 * 10u128.pow(18),
        salt: "secret_salt_999".to_string(),
    };
    let json_bytes = serde_json::to_vec(&pos_payload).unwrap();
    let hex_cipher = format!("0x{}", hex::encode(json_bytes));

    let ingest_res = server.handle_request(VSocketRequest::IngestDeposit {
        ciphertext: hex_cipher,
        liquidation_threshold_bps: 7500, // 75%
    });
    assert!(ingest_res.success);

    // 2. Update price: ZEN falls to $9.00 ($9,000 collateral * 75% = $6,750 adjusted vs $8,000 debt => liquidatable)
    let oracle_res = server.handle_request(VSocketRequest::UpdateOracle {
        asset: "0xZEN".to_string(),
        price_usd_8_dec: 900_000_000,
    });
    assert!(oracle_res.success);

    let debt_oracle_res = server.handle_request(VSocketRequest::UpdateOracle {
        asset: "0xUSDC".to_string(),
        price_usd_8_dec: 100_000_000,
    });
    assert!(debt_oracle_res.success);

    let commitment = CommitmentScheme::compute_commitment(&pos_payload.institution_id, &pos_payload.salt);
    let comm_hex = format!("0x{}", hex::encode(commitment));

    // 3. Evaluate health
    let health_res = server.handle_request(VSocketRequest::EvaluateHealth {
        commitment: comm_hex.clone(),
    });
    assert!(health_res.success);
    assert_eq!(health_res.data["is_liquidatable"], true);

    // 4. Request blind liquidation ticket
    let ticket_res = server.handle_request(VSocketRequest::RequestBlindLiquidation {
        commitment: comm_hex,
        chain_id: 7332,
        exitpoint_address: "0x1122334455667788990011223344556677889900".to_string(),
        timestamp: 1700000000,
        nonce: 501,
    });
    assert!(ticket_res.success);
    assert!(ticket_res.data["signature_hex"].as_str().unwrap().starts_with("0x"));
}

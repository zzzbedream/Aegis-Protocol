use aegis_tee::crypto::attestation::EnclaveSigner;
use aegis_tee::crypto::decrypt::PayloadDecryptor;
use aegis_tee::vsocket::server::{VSocketRequest, VSocketServer};

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    println!("=== Aegis Protocol: Vela / AWS Nitro Enclave Coprocessor ===");

    // In production, seed is derived from AWS Nitro Enclave KMS / PCR attestation
    let private_seed = [0x0B; 32];
    let signer = EnclaveSigner::from_private_key(&private_seed)?;
    let decryptor = PayloadDecryptor::new(private_seed);

    let enclave_eth_addr = signer.ethereum_address();
    println!(
        "[Enclave Boot] Hardware Root Signer Address: 0x{}",
        hex::encode(enclave_eth_addr)
    );

    let server = VSocketServer::new(signer, decryptor);

    // Demonstrate V-Socket initialization response
    let addr_res = server.handle_request(VSocketRequest::GetEnclaveAddress);
    println!("[V-Socket Ready] Registered Enclave RPC: {:?}", addr_res);

    println!("Enclave initialized and awaiting L3 requests...");
    Ok(())
}

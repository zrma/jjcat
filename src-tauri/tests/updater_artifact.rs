use std::{env, fs};

use base64::{Engine as _, engine::general_purpose::STANDARD};
use minisign_verify::{PublicKey, Signature};

const FIXTURE_PAYLOAD: &[u8] = include_bytes!("fixtures/updater-signature-payload.txt");
const FIXTURE_PUBLIC_KEY: &str = concat!(
    "dW50cnVzdGVkIGNvbW1lbnQ6IG1pbmlzaWduIHB1YmxpYyBrZXk6IEYxODU2RkU1MDdDOTVCRDY",
    "KUldUV1c4a0g1VytGOFZsbHNTUzRicGRhWFJOeW9KQ0hRM1ZpbG9ranVoVFRLbGNGVUZ3WXdpRjIK",
);
const FIXTURE_SIGNATURE: &str = concat!(
    "dW50cnVzdGVkIGNvbW1lbnQ6IHNpZ25hdHVyZSBmcm9tIHRhdXJpIHNlY3JldCBrZXkK",
    "UlVUV1c4a0g1VytGOFdBclA5dkNNaUdzSTNLdFA0OTZRWGRTdnAxaU1Pekh6S3RpcENGdz",
    "BLU0N2cXlOVjgyMGxIMFU0dGRDTGVPR2dBanRqUVlSelUzTjQ4TWVpa0VQcmd3PQp0cnVz",
    "dGVkIGNvbW1lbnQ6IHRpbWVzdGFtcDoxNzg1MzQ2ODUyCWZpbGU6cGF5bG9hZAphSk1OS",
    "VFadk5rSysxcG9JOCt0WUJxWmthQ0grZ0xhbTI5WlhNNjNDQVRNdjZqOVdZdktoYjlkST",
    "BGNTUrYlY0aE9BU3JOcjFOdDBTWjBPNGRqcW5Edz09Cg==",
);

fn decode_tauri_signer_value(value: &str, label: &str) -> String {
    let decoded = STANDARD
        .decode(value.trim())
        .unwrap_or_else(|error| panic!("{label} is not valid base64: {error}"));

    String::from_utf8(decoded)
        .unwrap_or_else(|error| panic!("{label} does not contain UTF-8 Minisign data: {error}"))
}

fn fixture_verifier() -> (PublicKey, Signature) {
    let public_key = decode_tauri_signer_value(FIXTURE_PUBLIC_KEY, "fixture public key");
    let signature = decode_tauri_signer_value(FIXTURE_SIGNATURE, "fixture signature");
    (
        PublicKey::decode(&public_key).expect("fixture public key must be Minisign data"),
        Signature::decode(&signature).expect("fixture signature must be Minisign data"),
    )
}

#[test]
fn verifies_tauri_signer_fixture() {
    let (public_key, signature) = fixture_verifier();
    public_key
        .verify(FIXTURE_PAYLOAD, &signature, true)
        .expect("fixture signature must match its payload");
}

#[test]
fn rejects_a_tampered_updater_payload() {
    let (public_key, signature) = fixture_verifier();
    let mut tampered = FIXTURE_PAYLOAD.to_vec();
    tampered[0] ^= 1;
    assert!(public_key.verify(&tampered, &signature, true).is_err());
}

#[test]
#[ignore = "requires a packaged updater archive and its release public key"]
fn verifies_external_updater_artifact() {
    let archive_path =
        env::var("JJCAT_UPDATER_ARCHIVE").expect("JJCAT_UPDATER_ARCHIVE must be set");
    let signature_path =
        env::var("JJCAT_UPDATER_SIGNATURE").expect("JJCAT_UPDATER_SIGNATURE must be set");
    let public_key =
        env::var("JJCAT_UPDATER_PUBLIC_KEY").expect("JJCAT_UPDATER_PUBLIC_KEY must be set");

    let archive = fs::read(&archive_path).expect("updater archive must be readable");
    let encoded_signature =
        fs::read_to_string(&signature_path).expect("updater signature must be readable");
    let decoded_public_key = decode_tauri_signer_value(&public_key, "updater public key");
    let decoded_signature = decode_tauri_signer_value(&encoded_signature, "updater signature");

    let public_key =
        PublicKey::decode(&decoded_public_key).expect("updater public key must be Minisign data");
    let signature =
        Signature::decode(&decoded_signature).expect("updater signature must be Minisign data");

    public_key
        .verify(&archive, &signature, true)
        .expect("updater archive signature must match its release public key");
}

// Interop driver for vela-app/wasmtest/crypto_interop_test.go (not run standalone).
// Uses the exact library the browser uses (@horizen/vela-common-ts, Node entry).
//   node p521.mjs encrypt <teePubHex> <utf8 message>  -> prints {"userPub":..,"userPriv":..,"cipher":..}
//   node p521.mjs decrypt <userPrivJWK> <teePubHex> <cipherHex> -> prints plaintext
import { generateKeyPair, importPublicKeyFromHex, exportPublicKeyToHex, exportPrivateKeyToJWK, importPrivateKeyFromJWK, encrypt, decrypt, bytesToHex, hexToBytes } from '@horizen/vela-common-ts';

const [, , mode, ...args] = process.argv;
const hex = (b) => (bytesToHex(b).startsWith('0x') ? bytesToHex(b) : '0x' + bytesToHex(b));
if (mode === 'encrypt') {
  const [teePubHex, message] = args;
  const user = await generateKeyPair();
  const teePub = await importPublicKeyFromHex(teePubHex);
  const cipher = await encrypt(user.privateKey, teePub, new TextEncoder().encode(message));
  console.log(JSON.stringify({
    userPub: await exportPublicKeyToHex(user.publicKey),
    userPriv: JSON.stringify(await exportPrivateKeyToJWK(user.privateKey)),
    cipher: hex(cipher),
  }));
} else if (mode === 'decrypt') {
  const [userPrivJWK, teePubHex, cipherHex] = args;
  const priv = await importPrivateKeyFromJWK(JSON.parse(userPrivJWK));
  const teePub = await importPublicKeyFromHex(teePubHex);
  const plain = await decrypt(priv, teePub, hexToBytes(cipherHex));
  process.stdout.write(new TextDecoder().decode(plain));
} else {
  console.error('usage: encrypt|decrypt');
  process.exit(2);
}

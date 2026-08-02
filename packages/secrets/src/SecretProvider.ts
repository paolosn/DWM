/** Contrato de cifrado/descifrado. `encrypt`/`decrypt` operan siempre sobre texto en claro y una salida opaca. */
export interface SecretProvider {
  encrypt(plainText: string): Promise<string>;
  decrypt(cipherText: string): Promise<string>;
}

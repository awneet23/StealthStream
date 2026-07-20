declare module "blake-hash" {
  type BlakeHash = {
    update(input: Uint8Array): BlakeHash;
    digest(): Uint8Array;
  };
  const createBlakeHash: (algorithm: string) => BlakeHash;
  export default createBlakeHash;
}

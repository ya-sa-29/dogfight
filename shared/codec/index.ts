export { encode, decode } from "./jsonCodec.js";
export {
  encodeBinary,
  decodeBinary,
  CodecError,
  BINARY_FORMAT_VERSION,
  type BinaryInputMessage,
  type BinarySnapshotMessage,
  type BinaryEntity,
} from "./binaryCodec.js";
export { jsonCodec, binaryCodec, getCodec, type Codec, type EncodedMessage } from "./codec.js";



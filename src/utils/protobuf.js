/**
 * Minimal protobuf wire-format reader. Returns [fieldNumber, value] pairs:
 * varint → BigInt, length-delimited / fixed → Buffer.
 */

export function readFields(buf) {
  const fields = [];
  let i = 0;

  const readVarint = () => {
    let result = 0n;
    let shift = 0n;
    for (;;) {
      const byte = buf[i++];
      if (byte === undefined) throw new Error("protobuf: truncated varint");
      result |= BigInt(byte & 0x7f) << shift;
      if (!(byte & 0x80)) return result;
      shift += 7n;
    }
  };

  const readBytes = (length) => {
    if (i + length > buf.length) throw new Error("protobuf: truncated field");
    const slice = buf.subarray(i, i + length);
    i += length;
    return slice;
  };

  while (i < buf.length) {
    const key = Number(readVarint());
    const field = key >> 3;
    switch (key & 7) {
      case 0: fields.push([field, readVarint()]); break;
      case 1: fields.push([field, readBytes(8)]); break;
      case 2: fields.push([field, readBytes(Number(readVarint()))]); break;
      case 5: fields.push([field, readBytes(4)]); break;
      default: throw new Error(`protobuf: unsupported wire type ${key & 7}`);
    }
  }
  return fields;
}

export function firstField(fields, number) {
  return fields.find(([f]) => f === number)?.[1];
}

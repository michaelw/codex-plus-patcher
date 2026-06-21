const crypto = require("node:crypto");
const fs = require("node:fs");

function sha256(buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

function sha256File(file) {
  return sha256(fs.readFileSync(file));
}

function readAsar(asarPath) {
  const buffer = fs.readFileSync(asarPath);
  const jsonSize = buffer.readUInt32LE(12);
  const header = JSON.parse(buffer.subarray(16, 16 + jsonSize).toString("utf8"));
  return { buffer, dataStart: 16 + jsonSize, header };
}

function walkFiles(node, prefix = "", out = []) {
  if (!node.files) return out;
  for (const [name, child] of Object.entries(node.files)) {
    const next = prefix ? `${prefix}/${name}` : name;
    if (child.files) walkFiles(child, next, out);
    else out.push([next, child]);
  }
  return out;
}

function fileIntegrity(buffer) {
  const blockSize = 4 * 1024 * 1024;
  const blocks = [];
  for (let offset = 0; offset < buffer.length; offset += blockSize) {
    blocks.push(sha256(buffer.subarray(offset, offset + blockSize)));
  }
  return {
    algorithm: "SHA256",
    hash: sha256(buffer),
    blockSize,
    blocks,
  };
}

function patchAsar(asarPath, fileTransforms) {
  const archive = readAsar(asarPath);
  const entries = walkFiles(archive.header);
  const contents = new Map();

  for (const [filePath, node] of entries) {
    if (node.unpacked) continue;
    const offset = archive.dataStart + Number(node.offset || 0);
    contents.set(filePath, Buffer.from(archive.buffer.subarray(offset, offset + Number(node.size || 0))));
  }

  for (const [filePath, transform] of fileTransforms) {
    const original = contents.get(filePath);
    if (!original) throw new Error(`Could not find ${filePath} in app.asar`);
    const patched = transform(original.toString("utf8"));
    contents.set(filePath, Buffer.from(patched, "utf8"));
  }

  let dataOffset = 0;
  const dataBuffers = [];
  for (const [filePath, node] of entries) {
    if (node.unpacked) continue;
    const content = contents.get(filePath);
    node.size = content.length;
    node.offset = String(dataOffset);
    node.integrity = fileIntegrity(content);
    dataBuffers.push(content);
    dataOffset += content.length;
  }

  const json = Buffer.from(JSON.stringify(archive.header), "utf8");
  const header = Buffer.alloc(16);
  header.writeUInt32LE(4, 0);
  header.writeUInt32LE(json.length + 8, 4);
  header.writeUInt32LE(json.length + 4, 8);
  header.writeUInt32LE(json.length, 12);

  fs.writeFileSync(asarPath, Buffer.concat([header, json, ...dataBuffers]));
  return sha256File(asarPath);
}

module.exports = {
  patchAsar,
  readAsar,
  sha256,
  sha256File,
  walkFiles,
};

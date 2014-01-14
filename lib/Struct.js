var Struct = exports.Struct = function Struct(raw) {
  Object.defineProperty(this, 'buffer', {
    enumerable: true,
    value: new Buffer(raw.length)
  });
  raw.copy(this.buffer);
  
  this.pointer = 0;
};

Struct.prototype.incrPointer = function incrPointer(amount) {
  this.pointer += amount;
  return (this.buffer.length < this.pointer)? false : true;
};

Struct.prototype.setPointer = function setPointer(amount) {
  this.pointer = amount;
  return (this.buffer.length < this.pointer)? false : true;
};

Struct.prototype.readUInt16LE = function readUInt16LE() {
  return this.buffer.readUInt16LE(this.pointer);
};

Struct.prototype.readUInt32LE = function readUInt32LE() {
  return this.buffer.readUInt32LE(this.pointer);
};

Struct.prototype.readVarInt = function readVarInt() {
  var flag = this.buffer[this.pointer];
  if (flag < 0xfd) {
    return [flag, 1];
  } else if (flag == 0xfd) {
    return [this.buffer.readUInt16LE(this.pointer+1), 3];
  } else if (flag == 0xfe) {
    return [this.buffer.readUInt32LE(this.pointer+1), 5];
  } else {
    return [this.buffer.slice(this.pointer+1, this.pointer+9), 9];
  }
};

Struct.prototype.raw = function raw(length) {
  var out = new Buffer(length);
  this.buffer.copy(out, 0, this.pointer, this.pointer+length);
  return out;
}
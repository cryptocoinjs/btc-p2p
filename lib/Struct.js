var events = require('events');
var util = require('util');

var Struct = exports.Struct = function Struct(raw) {
  events.EventEmitter.call(this);
  Object.defineProperty(this, 'buffer', {
    enumerable: true,
    value: new Buffer(raw.length)
  });
  raw.copy(this.buffer);
  
  this.pointer = 0;
  this.hasFailed = false;
};
util.inherits(Struct, events.EventEmitter);

Struct.prototype.pointerCheck = function pointerCheck(num) {
  num = +num || 0;
  if (this.buffer.length < this.pointer+num) {
    this.emit('error');
    this.hasFailed = true;
    return false;
  }
};

Struct.prototype.incrPointer = function incrPointer(amount) {
  if (this.hasFailed) return false;
  this.pointer += amount;
  this.pointerCheck();
};

Struct.prototype.setPointer = function setPointer(amount) {
  if (this.hasFailed) return false;
  this.pointer = amount;
  this.pointerCheck();
};

Struct.prototype.readInt8 = function readInt8() {
  if (this.hasFailed || this.pointerCheck() === false) return false;
  var out = this.buffer[this.pointer];
  this.incrPointer(1);
  return out;
};

Struct.prototype.readUInt16LE = function readUInt16LE() {
  if (this.hasFailed || this.pointerCheck(2) === false) return false;
  var out = this.buffer.readUInt16LE(this.pointer);
  this.incrPointer(2);
  return out
};

Struct.prototype.readUInt32LE = function readUInt32LE() {
  if (this.hasFailed || this.pointerCheck(4) === false) return false;
  var out = this.buffer.readUInt32LE(this.pointer);
  this.incrPointer(4);
  return out
};

Struct.prototype.readVarInt = function readVarInt() {
  if (this.hasFailed || this.pointerCheck() === false) return false;
  var flag = this.readInt8();
  if (flag < 0xfd) {
    return flag;
  } else if (flag == 0xfd) {
    return this.readUInt16LE();
  } else if (flag == 0xfe) {
    return this.readUInt32LE();
  } else {
    return this.raw(8);
  }
};

Struct.prototype.readVarString = function readVarString() {
  if (this.hasFailed || this.pointerCheck() === false) return false;
  var length = this.readVarInt();
  var str = [];
  for (var i = 0; i < length; i++) {
    str.push(String.fromCharCode(this.readInt8()));
  }
  return str.join('');
}

Struct.prototype.raw = function raw(length) {
  if (this.hasFailed || this.pointerCheck(length) === false) return false;
  var out = new Buffer(length);
  this.buffer.copy(out, 0, this.pointer, this.pointer+length);
  this.incrPointer(length);
  return out;
}
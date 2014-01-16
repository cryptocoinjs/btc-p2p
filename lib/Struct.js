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
};
util.inherits(Struct, events.EventEmitter);

Struct.prototype.pointerCheck = function pointerCheck(num) {
  num = +num || 0;
  if (this.buffer.length < this.pointer+num) {
    this.emit('error');
  }
};

Struct.prototype.incrPointer = function incrPointer(amount) {
  this.pointer += amount;
  this.pointerCheck();
};

Struct.prototype.setPointer = function setPointer(amount) {
  this.pointer = amount;
  this.pointerCheck();
};

Struct.prototype.readInt8 = function readInt8() {
  this.pointerCheck();
  var out = this.buffer[this.pointer];
  this.incrPointer(1);
  return out;
};

Struct.prototype.readUInt16LE = function readUInt16LE() {
  this.pointerCheck(2);
  var out = this.buffer.readUInt16LE(this.pointer);
  this.incrPointer(2);
  return out
};

Struct.prototype.readUInt32LE = function readUInt32LE() {
  this.pointerCheck(4);
  var out = this.buffer.readUInt32LE(this.pointer);
  this.incrPointer(4);
  return out
};

Struct.prototype.readVarInt = function readVarInt() {
  this.pointerCheck();
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
  var length = this.readVarInt();
  var str = [];
  for (var i = 0; i < length; i++) {
    str.push(String.fromCharCode(this.readInt8()));
  }
  return str.join('');
}

Struct.prototype.raw = function raw(length) {
  this.pointerCheck(length);
  var out = new Buffer(length);
  this.buffer.copy(out, 0, this.pointer, this.pointer+length);
  this.incrPointer(length);
  return out;
}
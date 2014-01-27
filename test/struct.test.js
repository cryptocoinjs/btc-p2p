var Struct = require('../lib/Struct').Struct;
var assert = require("assert")

describe('Struct', function() {
  it('should fail on increment overflow', function() {
    var s = new Struct(new Buffer(10));
    for (var i = 0; i < 11; i++) {
      s.incrPointer(1);
    }
    assert.equal(s.hasFailed, true);
  });
  it('should fail on set overflow', function() {
    var s = new Struct(new Buffer(10));
    s.setPointer(11);
    assert.equal(s.hasFailed, true);
  });
  it('readInt8() should return sequential 8-bit numbers', function() {
    var s = new Struct(new Buffer([1,2,3,4,5]));
    var test = [];
    for (var i = 0; i < 5; i++) {
      test.push(s.readInt8());
    }
    assert.equal(test.join(','), '1,2,3,4,5');
    assert.equal(s.hasFailed, false);
  });
  it('readUInt16LE() should return sequential 16-bit numbers', function() {
    var s = new Struct(new Buffer([1,0,2,0,3,0,4,0,5,0]));
    var test = [];
    for (var i = 0; i < 5; i++) {
      test.push(s.readUInt16LE());
    }
    assert.equal(test.join(','), '1,2,3,4,5');
    assert.equal(s.hasFailed, false);
  });
  it('readUInt32LE() should return sequential 32-bit numbers', function() {
    var s = new Struct(new Buffer([1,0,0,0,2,0,0,0,3,0,0,0,4,0,0,0,5,0,0,0]));
    var test = [];
    for (var i = 0; i < 5; i++) {
      test.push(s.readUInt32LE());
    }
    assert.equal(test.join(','), '1,2,3,4,5');
    assert.equal(s.hasFailed, false);
  });
  describe('readVarInt()', function() {
    it('should parse 8-bit numbers', function() {
      var s = new Struct(new Buffer([1,2,3,4,5]));
      var test = [];
      for (var i = 0; i < 5; i++) {
        test.push(s.readVarInt());
      }
      assert.equal(test.join(','), '1,2,3,4,5');
      assert.equal(s.hasFailed, false);
    });
    it('should parse 16-bit numbers', function() {
      var s = new Struct(new Buffer([253,1,0,253,2,0,253,3,0,253,4,0,253,5,0]));
      var test = [];
      for (var i = 0; i < 5; i++) {
        test.push(s.readVarInt());
      }
      assert.equal(test.join(','), '1,2,3,4,5');
      assert.equal(s.hasFailed, false);
    });
    it('should parse 32-bit numbers', function() {
      var s = new Struct(new Buffer([254,1,0,0,0,254,2,0,0,0,254,3,0,0,0,254,4,0,0,0,254,5,0,0,0]));
      var test = [];
      for (var i = 0; i < 5; i++) {
        test.push(s.readVarInt());
      }
      assert.equal(test.join(','), '1,2,3,4,5');
      assert.equal(s.hasFailed, false);
    });
    it('should parse 64-bit numbers', function() {
      var s = new Struct(new Buffer([255,1,0,0,0,0,0,0,0,255,2,0,0,0,0,0,0,0,255,3,0,0,0,0,0,0,0,255,4,0,0,0,0,0,0,0,255,5,0,0,0,0,0,0,0]));
      var test = [];
      for (var i = 0; i < 5; i++) {
        var rs = s.readVarInt();
        assert.ok(Buffer.isBuffer(rs));
        assert.equal(rs.length, 8);
        assert.equal(rs.readUInt32LE(4), 0);
        test.push(rs.readUInt32LE(0));
      }
      assert.equal(test.join(','), '1,2,3,4,5');
      assert.equal(s.hasFailed, false);
    });
  });
  it('readVarString() should return proper result', function() {
    var s = new Struct(new Buffer('0F2F5361746F7368693A302E372E322F', 'hex'));
    assert.equal(s.readVarString(), '/Satoshi:0.7.2/');
    assert.equal(s.hasFailed, false);
  });
  it('raw() should return a new Buffer', function() {
    var s = new Struct(new Buffer([1,2,3,4,5]));
    var test = s.raw(3);
    assert.ok(Buffer.isBuffer(test));
    assert.equal(test.length, 3);
    assert.equal(test.toString('hex'), '010203');
    test[1] = 255; // set value in the result
    s.setPointer(1);
    assert.equal(s.readInt8(), 2); // old value should be unaffected
    assert.equal(s.hasFailed, false);
  })
});
 
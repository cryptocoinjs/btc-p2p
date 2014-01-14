var Struct = require('../lib/Struct').Struct;
var assert = require("assert")

describe('Struct', function() {
  it('should emit error on increment overflow', function() {
    var s = new Struct(new Buffer(10));
    assert.throws(function() {
      for (var i = 0; i < 11; i++) {
        s.incrPointer(1);
      }
    });
  });
  it('should emit error on set overflow', function() {
    var s = new Struct(new Buffer(10));
    assert.throws(function() {
      s.setPointer(11);
    });
  });
  it('readInt8() should return sequential 8-bit numbers', function() {
    var s = new Struct(new Buffer([1,2,3,4,5]));
    var test = [];
    for (var i = 0; i < 5; i++) {
      test.push(s.readInt8());
    }
    assert.equal('1,2,3,4,5', test.join(','));
  });
  it('readUInt16LE() should return sequential 16-bit numbers', function() {
    var s = new Struct(new Buffer([1,0,2,0,3,0,4,0,5,0]));
    var test = [];
    for (var i = 0; i < 5; i++) {
      test.push(s.readUInt16LE());
    }
    assert.equal('1,2,3,4,5', test.join(','));
  });
  it('readUInt32LE() should return sequential 32-bit numbers', function() {
    var s = new Struct(new Buffer([1,0,0,0,2,0,0,0,3,0,0,0,4,0,0,0,5,0,0,0]));
    var test = [];
    for (var i = 0; i < 5; i++) {
      test.push(s.readUInt32LE());
    }
    assert.equal('1,2,3,4,5', test.join(','));
  });
  describe('readVarInt()', function() {
    it('should parse 8-bit numbers', function() {
      var s = new Struct(new Buffer([1,2,3,4,5]));
      var test = [];
      for (var i = 0; i < 5; i++) {
        test.push(s.readVarInt());
      }
      assert.equal('1,2,3,4,5', test.join(','));
    });
    it('should parse 16-bit numbers', function() {
      var s = new Struct(new Buffer([253,1,0,253,2,0,253,3,0,253,4,0,253,5,0]));
      var test = [];
      for (var i = 0; i < 5; i++) {
        test.push(s.readVarInt());
      }
      assert.equal('1,2,3,4,5', test.join(','));
    });
    it('should parse 32-bit numbers', function() {
      var s = new Struct(new Buffer([254,1,0,0,0,254,2,0,0,0,254,3,0,0,0,254,4,0,0,0,254,5,0,0,0]));
      var test = [];
      for (var i = 0; i < 5; i++) {
        test.push(s.readVarInt());
      }
      assert.equal('1,2,3,4,5', test.join(','));
    });
    it('should parse 64-bit numbers', function() {
      var s = new Struct(new Buffer([255,1,0,0,0,0,0,0,0,255,2,0,0,0,0,0,0,0,255,3,0,0,0,0,0,0,0,255,4,0,0,0,0,0,0,0,255,5,0,0,0,0,0,0,0]));
      var test = [];
      for (var i = 0; i < 5; i++) {
        var rs = s.readVarInt();
        assert.ok(Buffer.isBuffer(rs));
        assert.equal(8, rs.length);
        assert.equal(0, rs.readUInt32LE(4));
        test.push(rs.readUInt32LE(0));
      }
      assert.equal('1,2,3,4,5', test.join(','));
    });
  });
  it('readVarString() should return proper result', function() {
    var s = new Struct(new Buffer('0F2F5361746F7368693A302E372E322F', 'hex'));
    assert.equal("/Satoshi:0.7.2/", s.readVarString());
  });
  it('raw() should return a new Buffer', function() {
    var s = new Struct(new Buffer([1,2,3,4,5]));
    var test = s.raw(3);
    assert.ok(Buffer.isBuffer(test));
    assert.equal(3, test.length);
    assert.equal('010203', test.toString('hex'));
    test[1] = 255; // set value in the result
    s.setPointer(1);
    assert.equal(2, s.readInt8()); // old value should be unaffected
  })
});
 
var BTCNetwork = require('../lib/BTCNetwork').BTCNetwork;
var assert = require("assert")


var n = new BTCNetwork();
var p = {}; // Dummy Peer

describe('BTCNetwork', function() {
  it('should properly parse a VERSION message', function() {
    var test = n.parseVersionMessage(new Buffer('7111010001000000000000006017d65200000000010000000000000000000000000000000000ffff4581caaac2e7010000000000000000000000000000000000ffffb78d744f208d351351d2b1e1b0400f2f5361746f7368693a302e382e352fec470400', 'hex'), p);
    assert.equal(test.version, 70001);
    assert.equal(test.services.readUInt32LE(0), 1);
    assert.equal(test.time.getTime(), 1389762400000);
    assert.equal(test.addr_recv.services.readUInt32LE(0), 1);
    assert.equal(test.addr_recv.host, '69.129.202.170');
    assert.equal(test.addr_recv.port, 49895);
    assert.equal(test.addr_from.services.readUInt32LE(0), 1);
    assert.equal(test.addr_from.host, '183.141.116.79');
    assert.equal(test.addr_from.port, 8333);
    assert.equal(test.nonce.toString('hex'),  '351351d2b1e1b040');
    assert.equal(test.client, '/Satoshi:0.8.5/');
    assert.equal(test.height, 280556);
  });
  it('should properly parse an INV message', function() {
    var test = n.parseInvMessage(new Buffer('0101000000f2bc363cb9ddc6d29beef22c91305da25a88cbb7272dc099c33a75baebfc8c14', 'hex'));
    var items = test.items;
    assert.ok(Array.isArray(items));
    assert.equal(items.length, 1);
    assert.equal(items[0].type, 1);
    assert.equal(items[0].hash.toString('hex'), 'f2bc363cb9ddc6d29beef22c91305da25a88cbb7272dc099c33a75baebfc8c14');
  });
  it('should properly parse an ADDR message', function() {
    var test = n.parseAddrMessage(new Buffer('013722d652010000000000000000000000000000000000ffff525f8c25208d', 'hex'));
    var addrs = test.addrs;
    assert.ok(Array.isArray(addrs));
    assert.equal(addrs.length, 1);
    assert.equal(addrs[0].timestamp.getTime(), 1389765175000);
    assert.equal(addrs[0].services.readUInt32LE(0), 1);
    assert.equal(addrs[0].host, '82.95.140.37');
    assert.equal(addrs[0].port, 8333);
  });
});

var BTCNetwork = require('../lib/BTCNetwork').BTCNetwork;
var assert = require("assert")


var n = new BTCNetwork();
var p = {}; // Dummy Peer

describe('BTCNetwork', function() {
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
  it('should properly reject a badly-formatted ADDR message', function() {
    assert.equal(n.parseAddrMessage(new Buffer('0102030405', 'hex')), false);
  });
  it('should properly parse an ALERT message', function() {
    var test = n.parseAlertMessage(new Buffer('73010000003766404f00000000b305434f00000000f2030000f1030000001027000048ee00000064000000004653656520626974636f696e2e6f72672f666562323020696620796f7520686176652074726f75626c6520636f6e6e656374696e67206166746572203230204665627275617279004730450221008389df45f0703f39ec8c1cc42c13810ffcae14995bb648340219e353b63b53eb022009ec65e1c1aaeec1fd334c6b684bde2b3f573060d5b70c3a46723326e4e8a4f1', 'hex'));
    assert.notEqual(test, false);
    assert.equal(test.version, 1);
    assert.equal(test.relay_until.getTime(), 1329620535000);
    assert.equal(test.expiration.getTime(), 1329792435000);
    assert.equal(test.uuid, 1010);
    assert.equal(test.cancel, 1009);
    assert.ok(Array.isArray(test.cancel_set));
    assert.equal(test.cancel_set.length, 0);
    assert.equal(test.min_version, 10000);
    assert.equal(test.max_version, 61000);
    assert.ok(Array.isArray(test.subversion_set));
    assert.equal(test.subversion_set.length, 0);
    assert.equal(test.priority, 100);
    assert.equal(test.comment, "");
    assert.equal(test.status_bar, 'See bitcoin.org/feb20 if you have trouble connecting after 20 February');
    assert.ok(Buffer.isBuffer(test.reserved));
    assert.equal(test.reserved.toString('hex'), '');
    assert.equal(test.signature.toString('hex'), '30450221008389df45f0703f39ec8c1cc42c13810ffcae14995bb648340219e353b63b53eb022009ec65e1c1aaeec1fd334c6b684bde2b3f573060d5b70c3a46723326e4e8a4f1');
  });
  it('should properly reject a badly-formatted ALERT message', function() {
    assert.equal(n.parseAlertMessage(new Buffer('0102030405', 'hex')), false);
  });
  it('should properly reject a badly-formatted GETBLOCKS message', function() {
    assert.equal(n.parseGetblocksMessage(new Buffer('0102030405', 'hex')), false);
  });
  it('should properly reject a badly-formatted GETHEADERS message', function() {
    assert.equal(n.parseGetheadersMessage(new Buffer('0102030405', 'hex')), false);
  });
  it('should properly reject a badly-formatted HEADERS message', function() {
    assert.equal(n.parseHeadersMessage(new Buffer('0102030405', 'hex')), false);
  });
  it('should properly parse an INV message', function() {
    var test = n.parseInvMessage(new Buffer('0101000000f2bc363cb9ddc6d29beef22c91305da25a88cbb7272dc099c33a75baebfc8c14', 'hex'));
    var items = test.items;
    assert.ok(Array.isArray(items));
    assert.equal(items.length, 1);
    assert.equal(items[0].type, 1);
    assert.equal(items[0].hash.toString('hex'), 'f2bc363cb9ddc6d29beef22c91305da25a88cbb7272dc099c33a75baebfc8c14');
  });
  it('should properly reject a badly-formatted INV message', function() {
    assert.equal(n.parseInvMessage(new Buffer('0102030405', 'hex')), false);
  });
  it('should properly reject a badly-formatted NOTFOUND message', function() {
    assert.equal(n.parseNotfoundMessage(new Buffer('0102030405', 'hex')), false);
  });
  it('should properly reject a badly-formatted PING message', function() {
    assert.equal(n.parsePingMessage(new Buffer('0102030405', 'hex')), false);
  });
  it('should properly reject a badly-formatted TX message', function() {
    assert.equal(n.parseTxMessage(new Buffer('0102030405', 'hex')), false);
  });
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
  it('should properly reject a badly-formatted VERSION message', function() {
    assert.equal(n.parseVersionMessage(new Buffer('0102030405', 'hex')), false);
  });
});

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
  it('should properly parse a NOTFOUND message', function() {
    var test = n.parseNotfoundMessage(new Buffer('0101000000f2bc363cb9ddc6d29beef22c91305da25a88cbb7272dc099c33a75baebfc8c14', 'hex'));
    var items = test.items;
    assert.ok(Array.isArray(items));
    assert.equal(items.length, 1);
    assert.equal(items[0].type, 1);
    assert.equal(items[0].hash.toString('hex'), 'f2bc363cb9ddc6d29beef22c91305da25a88cbb7272dc099c33a75baebfc8c14');
  });
  it('should properly reject a badly-formatted NOTFOUND message', function() {
    assert.equal(n.parseNotfoundMessage(new Buffer('0102030405', 'hex')), false);
  });
  it('should properly parse a PING message', function() {
    var test = n.parsePingMessage(new Buffer('0102030405060708', 'hex'));
    assert.ok(Buffer.isBuffer(test.nonce));
    assert.equal(test.nonce.toString('hex'), '0102030405060708');
  });
  it('should properly reject a badly-formatted PING message', function() {
    assert.equal(n.parsePingMessage(new Buffer('0102030405', 'hex')), false);
  });
  it('should properly parse a TX message', function() {
    var test = n.parseTxMessage(new Buffer('01000000016DBDDB085B1D8AF75184F0BC01FAD58D1266E9B63B50881990E4B40D6AEE3629000000008B483045022100F3581E1972AE8AC7C7367A7A253BC1135223ADB9A468BB3A59233F45BC578380022059AF01CA17D00E41837A1D58E97AA31BAE584EDEC28D35BD96923690913BAE9A0141049C02BFC97EF236CE6D8FE5D94013C721E915982ACD2B12B65D9B7D59E20A842005F8FC4E02532E873D37B96F09D6D4511ADA8F14042F46614A4C70C0F14BEFF5FFFFFFFF02404B4C00000000001976A9141AA0CD1CBEA6E7458A7ABAD512A9D9EA1AFB225E88AC80FAE9C7000000001976A9140EAB5BEA436A0484CFAB12485EFDA0B78B4ECC5288AC00000000', 'hex'));
    assert.equal(test.version, 1);
    assert.ok(Array.isArray(test.txIn));
    assert.equal(test.txIn.length, 1);
    assert.ok(Array.isArray(test.txOut));
    assert.ok(Buffer.isBuffer(test.txIn[0].outPoint.hash));
    assert.equal(test.txIn[0].outPoint.hash.toString('hex'), '6dbddb085b1d8af75184f0bc01fad58d1266e9b63b50881990e4b40d6aee3629');
    assert.equal(test.txIn[0].outPoint.index, 0);
    assert.ok(Buffer.isBuffer(test.txIn[0].signature));
    assert.equal(test.txIn[0].signature.toString('hex'), '483045022100f3581e1972ae8ac7c7367a7a253bc1135223adb9a468bb3a59233f45bc578380022059af01ca17d00e41837a1d58e97aa31bae584edec28d35bd96923690913bae9a0141049c02bfc97ef236ce6d8fe5d94013c721e915982acd2b12b65d9b7d59e20a842005f8fc4e02532e873d37b96f09d6d4511ada8f14042f46614a4c70c0f14beff5');
    assert.equal(test.txIn[0].sequence, 0xFFFFFFFF);
    assert.equal(test.txOut.length, 2);
    assert.equal(test.txOut[0].value, 5000000);
    assert.ok(Buffer.isBuffer(test.txOut[0].script));
    assert.equal(test.txOut[0].script.toString('hex'), '76a9141aa0cd1cbea6e7458a7abad512a9d9ea1afb225e88ac');
    assert.equal(test.txOut[1].value, 3354000000);
    assert.ok(Buffer.isBuffer(test.txOut[1].script));
    assert.equal(test.txOut[1].script.toString('hex'), '76a9140eab5bea436a0484cfab12485efda0b78b4ecc5288ac');
    assert.equal(test.lock, 0);
    assert.ok(Buffer.isBuffer(test.raw));
    assert.equal(test.hash.toString('hex'), 'e293cdbee28102c38ee58814466c666146b3fad10505cfb4ace77eab513fa7d4');
  })
  it('should properly reject a badly-formatted TX message', function() {
    assert.equal(n.parseTxMessage(new Buffer('0102030405', 'hex')), false);
  });
  it('should properly parse a VERSION message', function() {
    var test = n.parseVersionMessage(new Buffer('7111010001000000000000006017d65200000000010000000000000000000000000000000000ffff4581caaac2e7010000000000000000000000000000000000ffffb78d744f208d351351d2b1e1b0400f2f5361746f7368693a302e382e352fec470400', 'hex'));
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

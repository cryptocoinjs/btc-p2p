var BTCNetwork = require('../lib/BTCNetwork').BTCNetwork;
var dns = require('dns');

var n = new BTCNetwork();

process.once('SIGINT', function() {
  console.log('Got SIGINT; closing...');
  process.once('SIGINT', function() {
    // Double SIGINT; force-kill
    process.exit(0);
  });
  n.shutdown();
});

// Error messages of various severity, from the PeerManager
n.on('error', function error(d) {
  console.log('('+d.severity+'): '+d.message);
});

n.on('peerStatus', function status(d) {
  console.log('PeerManager status:', d);
});

// Every message, from every active peer. Gets the message in its raw form (bubble up of 'message' from Peer)
n.on('message', function peerMessage(d) {
  console.log(d.peer.getUUID()+': message', d.command, d.data);
});

// Specific message from the BTCManager. Gets the message in its parsed form
n.on('versionMessage', function versionMessage(d) {
  console.log('VERSION:', d);
});

n.on('transactionInv', function transactionInv(d) {
  console.log('Peer '+d.peer.getUUID()+' knows of Transaction '+d.hash.toString('hex'));
  n.getData({type:1, hash:d.hash}, d.peer, function(err, rs) {
    if (err !== false) {
      console.log('Data returned error: '+err);
      return;
    }
    console.log('Data returned:', rs);
  });
});
n.on('transactionBlock', function transactionInv(d) {
  console.log('Peer '+d.peer.getUUID()+' knows of Block '+d.hash.toString('hex'));
});

/*
// Default launch, with DNS seeds
n.launch();
*/

// Single launch
n.options.minPeers = 1;
n.options.maxPeers = 1;
dns.resolve4('dnsseed.bluematt.me', function(err, addrs) {
  if (err) {
    console.log(err);
    return;
  }
  n.launch(addrs.shift());
  n.manager.addPool(addrs);
});

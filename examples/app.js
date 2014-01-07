var BTCNetwork = require('../lib/BTCNetwork').BTCNetwork;

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

// Every message, from every active peer
n.on('peerMessage', function peerMessage(d) {
  console.log(d.peer.getUUID()+': message', d.command, d.data.toString('hex'));
});

n.launch();

/*
// Single launch
dns.resolve4('dnsseed.bluematt.me', function(err, addrs) {
  if (err) {
    console.log(err);
    return;
  }
  n.launch(addrs.shift());
  //n.manager.addPool(addrs);
});
*/
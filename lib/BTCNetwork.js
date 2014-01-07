var PeerManager = require('crypto-p2p-manager').PeerManager;
var Message = require('./Message').Message;

var crypto = require('crypto');
var dns = require('dns');
var events = require('events');
var net = require('net');
var util = require('util');

var BTCNetwork = exports.BTCNetwork = function BTCNetwork(options) {
  events.EventEmitter.call(this);

  options = (typeof options === 'undefined')? {} : options;
  var defaultOpts = {
    'useCache': true,
    'listen': true,
    'port': 8333,
    'magic': 0xD9B4BEF9,
    'minPeers': 3,
    'maxPeers': 20,
    'idleTimeout': 30*60*1000, // time out peers we haven't heard anything from in 30 minutes
    'version': 70000,
    'services': new Buffer([1,0,0,0,0,0,0,0]),
    'clientName': 'Node.js lite peer',
    'knownHeight': 0,
    'externalIP': false
  };
  for (var name in defaultOpts) {
    if (defaultOpts.hasOwnProperty(name) && !options.hasOwnProperty(name)) {
      options[name] = defaultOpts[name];
    }
  }
  options.port = parseInt(options.port);
  options.magic = parseInt(options.magic);
  options.minPeers = parseInt(options.minPeers);
  options.maxPeers = parseInt(options.maxPeers);
  
  this.options = options;
  this.manager = new PeerManager(this.options);
  this.nonce = crypto.randomBytes(8);
  this.state = 'new';
  
  var self = this;
  this.manager
    .on('peerConnect', function handleConnect(d) {
      self.sendVersion(d.peer); // Send VERSION message
    })
    .on('peerMessage', function peerMessage(d) {
      self.emit('peerMessage', d); // Bubble up!
    })
    .on('addrMessage', function handleAddr(d) {
      var addrs = [];
      var addrNum = Message.prototype.getVarInt(d.data, 0);
      for (var i = addrNum[1]; i < d.data.length; i += 30) {
        addrs.push(self.getAddr(d.data.slice(i, i+30)));
      }
      if (addrs.length != addrNum[0]) {
        self._error('Was supposed to get '+addrNum[0]+' addresses, but got '+parsed.length+' instead', 'info');
      }
      self.manager.addPool(addrs); // Add these peers to the list of possible peers to connect to
    })
    .on('versionMessage', self.handleVersion.bind(self))
    .on('listenConnect', self.handleListenConnect.bind(self))
    .on('status', function(d) {
      self.emit('peerStatus', d); // Bubble up!
    })
    .on('error', function(d) {
      self.emit('error', d); // Bubble up!
    });
}
util.inherits(BTCNetwork, events.EventEmitter);

BTCNetwork.prototype.IPV6_IPV4_PADDING = new Buffer([0,0,0,0,0,0,0,0,0,0,255,255]);
BTCNetwork.prototype.defaultServices = new Buffer([1,0,0,0,0,0,0,0]);

BTCNetwork.prototype.launch = function launch(seeds) {
  this.state = 'launching';
  
  if (typeof seeds != 'undefined') {
    self.manager.launch(seeds);
    self.emit('launched');
    return;
  }
  
  // Resolve DNS seeds
  var dnsSeeds = ['bitseed.xf2.org', 'dnsseed.bluematt.me', 'seed.bitcoin.sipa.be', 'dnsseed.bitcoin.dashjr.org'];
  var waiting = dnsSeeds.length;
  var ipSeeds = [];
  var self = this;
  for (var i = 0; i < dnsSeeds.length; i++) {
  	dns.resolve4(dnsSeeds[i], function(err, addrs) {
  		if (err) {
  			console.log(err);
  		} else {
  			ipSeeds = ipSeeds.concat(addrs);
  		}
  		if (--waiting <= 0) {
        self.manager.launch(ipSeeds);
        self.emit('launched');
  		}
  	});
  };
};

BTCNetwork.prototype.handleListenConnect = function handleListenConnect(d) {
  var self = this;
  var watchdog = setTimeout(function() {
    // No VERSION message received
    self.manager.delActive(d.peer, 'No VERSION message received from remote peer');
  }, 10*1000);
  watchdog.unref();
  d.peer.once('versionMessage', function(d) {
    // VERSION message received
    clearTimeout(watchdog);
  });
};

BTCNetwork.prototype.handleVersion = function handleVersion(d) {
	var data = d.data;
	var parsed = {};
	parsed.version = data.readUInt32LE(0);
	parsed.services = new Buffer(8);
	data.copy(parsed.services, 0, 4, 12);
	parsed.time = new Buffer(8);
	data.copy(parsed.time, 0, 12, 20);
  if (parsed.time.readUInt32LE(4) == 0) {
    // 32-bit date; no need to keep as buffer
    parsed.time = new Date(parsed.time.readUInt32LE(0)*1000);
  }
	parsed.addr_recv = this.getAddr(data.slice(20, 46));
	parsed.addr_from = this.getAddr(data.slice(46, 72));
	parsed.nonce = new Buffer(8);
	data.copy(parsed.nonce, 0, 72, 80);
	parsed.client = Message.prototype.getVarString(data, 80);
	parsed.height = data.readUInt32LE(data.length-4);
	console.log('VERSION:', parsed);
  
	if (parsed.nonce.toString('hex') === this.nonce.toString('hex')) {
    // We connected to ourselves!
    this.manager.delActive(d.peer, 'connected to self');
    return;
  }
  
  d.peer.send('verack'); // Send VERACK message
  
  if (this.options.externalIP == false || (this.options.externalIP.toString('hex') != parsed.addr_recv.hostRaw.toString('hex') && parsed.addr_recv.hostRaw.slice(10,16).toHex != '000000000000')) {
    this.options.externalIP = parsed.addr_recv.hostRaw;
    this._error('External address discovered to be '+this.options.externalIP.toString('hex'), 'info');
  }
  // Save info for this peer
  d.peer.version = parsed.version;
  d.peer.services = parsed.services;
  d.peer.nonce = parsed.nonce;
  d.peer.knownHeight = parsed.height;
};

BTCNetwork.prototype.sendVersion = function sendVersion(p) {
  // Assemble remote address
  var addr = p.socket.remoteAddress;
  var remote_addr = new Buffer(26);
  remote_addr.fill(0);
  this.defaultServices.copy(remote_addr, 0, 0, 8);
  if (net.isIP(addr) == 4) {
    this.IPV6_IPV4_PADDING.copy(remote_addr, 8, 0, 12);
    var octets = addr.split('.');
    for (var i = 0; i < octets.length; i++) {
      remote_addr[i+20] = octets[i];
    }
  } else {
    // TODO parse IPv6 address
  }
  remote_addr.writeUInt16BE(p.socket.remotePort, 24);
  
  // Assemble local address
  var local_addr = new Buffer(26);
  local_addr.fill(0);
  this.options.services.copy(local_addr, 0, 0, 8);
  if (this.options.externalIP !== false) {
    this.options.externalIP.copy(local_addr, 8, 0, 16);
  }
  
	var msg = new Message(p.magicBytes, true)
		.putInt32(this.options.version) // version
		.putInt64(this.options.services) // services
		.putInt64(Math.round(new Date().getTime()/1000)) // timestamp
		.put(remote_addr) // addr_recv
		.put(local_addr) // addr_from
		.putInt64(this.nonce) // nonce
		.putVarString(this.options.clientName) // client
		.putInt32(this.options.knownHeight); // start_height

  var self = this;
  var watchdog = setTimeout(function() {
    // No VERACK received; disconnect
    self.manager.delActive(p, 'Failed to send VERACK after VERSION message');
  }, 10000).unref();
  p.once('verackMessage', function() {
    // VERACK received; this peer is active now
    clearTimeout(watchdog);
    p.state = 'active';
    if (self.state == 'launching') {
      // First peer to connect updates state
      self.state = 'running';
      self.emit('running');
      setTimeout(function() {
        self.addrPoll(); // Start polling for new peers
      }, 2000).unref();
    }
  });
	p.send('version', msg.raw());
	p.state = 'awaiting-verack';
};

BTCNetwork.prototype.addrPoll = function addrPoll() {
  var peers = this.manager.send(5, 'state', 'active', 'getaddr');
  if (peers === false) {
    this._error('No peers available to poll for peers', 'info');
  } else {
    var count = 0;
    for(var i in peers) {
      if (peers.hasOwnProperty(i)) count++;
    }
    this._error('Sent GETADDR to '+count+' peers', 'info');
  }
  var self = this;
  setTimeout(function() { self.addrPoll(); }, 60*1000).unref(); // Poll for peers again in a minute
};

BTCNetwork.prototype.getAddr = function getAddr(buff) {
  var IPV6_IPV4_PADDING = this.IPV6_IPV4_PADDING;
	var addr = {};
	if (buff.length == 30) {
		// with timestamp and services; from ADDR message
		addr.timestamp = new Date(buff.readUInt32LE(0)*1000);
		addr.services = new Buffer(8);
		buff.copy(addr.services, 0, 4, 12);
    addr.hostRaw = new Buffer(16);
    buff.copy(addr.hostRaw, 0, 12, 28);
		addr.host = getHost(addr.hostRaw);
		addr.port = buff.readUInt16BE(28);
	}	if (buff.length == 26) {
		// with services, no time; from VERSION message
		addr.services = new Buffer(8);
		buff.copy(addr.services, 0, 0, 8);
    addr.hostRaw = new Buffer(16);
    buff.copy(addr.hostRaw, 0, 8, 24);
		addr.host = getHost(addr.hostRaw);
		addr.port = buff.readUInt16BE(24);
	} else if (buff.length == 18) {
	  // IP and port alone
    addr.hostRaw = new Buffer(16);
    buff.copy(addr.hostRaw, 0, 0, 16);
		addr.host = getHost(addr.hostRaw);
		addr.port = buff.readUInt16BE(16);
	}
	return addr;
	
	function getHost(buff) {
		if (buff.slice(0, 12).toString('hex') == IPV6_IPV4_PADDING.toString('hex')) {
			// IPv4
			return Array.prototype.join.apply(buff.slice(12), ['.']);
    } else {
			// IPv6
			return buff.slice(0, 16).toString('hex')
				.match(/(.{1,4})/g)
				.join(':')
				.replace(/\:(0{1,3})/g, ':')
				.replace(/^(0{1,3})/g, '');
		}
	}
};

BTCNetwork.prototype.shutdown = function shutdown() {
  this.manager.shutdown();
};

// Trigger an error message. Severity is one of 'info', 'notice', 'warning', or 'error' (in increasing severity)
BTCNetwork.prototype._error = function _error(message, severity) {
  severity = severity || 'warning';
  this.emit('error', {
    severity: severity,
    message: message
  });
};

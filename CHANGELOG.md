0.2.0 / 2014-01-16
------------------
* Add parsing of more message types: `alert`, `getblocks`, `getheaders`, `headers`, `notfound`, and `tx`
* Separate `parse` from `handle`, so message payloads can be parsed independently of affecting the p2p network management

0.1.1 / 2014-01-13
------------------
* FIX: syntax error in prior release

0.1.0 / 2014-01-10
------------------
* Initial release
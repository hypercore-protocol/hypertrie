# hypertrie

Distributed single writer key/value store

```
npm install hypertrie
```

[![Build Status](https://travis-ci.org/mafintosh/hypertrie.svg?branch=master)](https://travis-ci.org/mafintosh/hypertrie)

Uses a rolling hash array mapped trie to index key/value data on top of a [hypercore](https://github.com/mafintosh/hypercore).

Useful if you just want a straight forward single writer kv store or if you are looking for a building block for building more complex multiwriter databases on top.

## Usage

```js
const hypertrie = require('hypertrie')
const db = hypertrie('./trie.db', {valueEncoding: 'json'})

db.put('hello', 'world', function () {
  db.get('hello', console.log)
})
```

## API

#### `db = hypertrie(storage, [key], [options])`

Create a new database. Options include:

```
{
  feed: aHypercore, // use this feed instead of loading storage
  valueEncoding: 'json', // set value encoding
  subtype: undefined, // set subtype in the header message at feed.get(0) 
  alwaysUpdate: true // perform an ifAvailable update prior to every head operation
}
```

If you set `options.feed` then you can set `storage` to null.

#### `db.get(key, [options], callback)`

Lookup a key. Returns a result node if found or `null` otherwise.
Options are passed through to hypercore's get method.

#### `db.put(key, value, [options], [callback])`

Insert a value.

Options can include:
```
{
  condition: function (oldNode, newNode, cb(err, bool)) { ... } 
}
```
The optional `condition` function provides atomic compare-and-swap semantics, allowing you to optionally abort a put based on the current and intended node values.
The condition callback should be used as follows:
1. `cb(new Error(...))`: Abort with an error that will be forwarded through the `put`.
2. `cb(null, false)`: Abort the put, but do not produce an error.
3. `cb(null, true)`: Proceed with the put.

#### `db.del(key, [options], [callback])`

Delete a key from the database.

Options can include:
```
{
  condition: function (oldNode, cb(err, bool)) { ... }
}
```
The optional `condition` function behaves the same as the one in `put`, minus the `newNode` parameter.

#### `db.batch(batch, [callback])`

Insert/delete multiple values atomically.
The batch objects should look like this:

```js
{
  type: 'put' | 'del',
  key: 'key/we/are/updating',
  value: optionalValue
}
```

#### `const watcher = db.watch(prefix, [onchange])`

Watch a prefix of the db and get notified when it changes.

When there is a change `watcher.on('change')` is emitted.
Use `watcher.destroy()` to stop watching.

#### `db.on('ready')`

Emitted when the db has loaded it's internal state.

You do not need to wait for this unless noted in the docs.

#### `db.version`

Returns the current version of the db (an incrementing integer).

Only available after `ready` has been emitted.

#### `db.key`

Returns the db public key. You need to pass this to other instances
you want to replicate with.

Only available after `ready` has been emitted.

#### `db.discoveryKey`

Returns the db discovery key. Can be used to find other db peers.

Only available after `ready` has been emitted.

#### `checkoutDb = db.checkout(version)`

Returns a new db instance checked out at the version specified.

#### `checkoutDb = db.snapshot()`

Same as checkout but just returns the latest version as a checkout.

#### `stream = db.replicate(isInitiator, [options])`

Returns a hypercore replication stream for the db. Pipe this together with another hypertrie instance.

Replicate takes an `isInitiator` boolean which is used to indicate if this replication stream is the passive/active replicator.

All options are forwarded to hypercores replicate method.

#### `ite = db.iterator(prefix, [options])`

Returns a [nanoiterator](https://github.com/mafintosh/nanoiterator) that iterates
the latest values in the prefix specified.

Options include:

```js
{
  recursive: true,
  random: false // does a random order iteration
}
```

If you set `recursive: false` it will only iterate the immediate children (similar to readdir)

Additional options are passed through to hypercore's get method.

#### `stream = db.createReadStream(prefix, [options])`

Same as above but as a stream

#### `db.list(prefix, [options], callback)`

Creates an iterator for the prefix with the specified options and buffers it into an array that is passed to the callback.

#### `stream = db.createWriteStream()`

A writable stream you can write batch objects to, to update the db.

#### `ite = db.history([options])`

Returns a [nanoiterator](https://github.com/mafintosh/nanoiterator) that iterates over the feed in causal order.

Options include:

```js
{
  gt: seq,
  lt: seq,
  gte: seq,
  lte: seq,
  reverse: false,
  live: false // set to true to keep iterating forever
}
```

#### `stream = db.createHistoryStream([options])`

Same as above but as a stream

#### `ite = db.diff(version, [prefix], [options])`

Returns a [nanoiterator](https://github.com/mafintosh/nanoiterator) that iterates the diff between the current db and the version you specifiy. The objects returned look like this

```js
{
  key: 'node-key-that-is-updated',
  left: <node>,
  right: <node>
}
```

If a node is in the current db but not in the version you are diffing against
`left` will be set to the current node and `right` will be null and vice versa.

Options include:

```js
{
  skipLeftNull: false,
  skipRightNull: false,
  hidden: false, // set to true to diff the hidden keyspace
  checkpoint: <checkpoint>
}
```

The order of messages emitted for a specific diff is predictable (ordered by key hash). It is possible to resume a diff at any position. To do so, call the `.checkpoint` method on the diff iterator. It returns a serialized buffer of the current position within the diff. To resume, create a new diff between the same versions and pass the checkpoint buffer as an option.

#### `stream = db.createDiffStream(version, [prefix])`

Same as above but as a stream

## License

MIT

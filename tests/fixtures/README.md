# Test fixtures

`frpc_full_example.toml` is copied from [fatedier/frp](https://github.com/fatedier/frp) v0.71.1 (`conf/frpc_full_example.toml`) and is used only to verify that FrpcDeck can parse and regenerate the complete set of documented client fields.

`frpc_template.toml` is a small fixture with `parseNumberRangePair` blocks used to verify that batch ranges become one editable batch proxy, round-trip through the generator, and still pass `frpc verify`.

The upstream project is licensed under the Apache License 2.0.

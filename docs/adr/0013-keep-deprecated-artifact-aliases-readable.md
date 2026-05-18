# Keep deprecated artifact aliases readable

Plebdev Bench keeps deprecated persisted aliases readable for historical **Run Results** and **Published Runs**, including fields such as `modelAlias`, `machineProfileId`, and `machineLabel`, while canonical docs and new code use glossary terms such as **Model Profile**, **Machine Profile**, and **Machine Instance**. Removing compatibility aliases would simplify schemas and dashboard code, but it would break historical comparability and make older benchmark evidence harder to inspect without an explicit migration.

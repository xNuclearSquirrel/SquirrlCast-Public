## Telemetry logging

Creates a CSV file with telemetry parameters received from the goggles. You can set the logging interval in the settings. Logs are saved in `Documents/SquirrelCast`

This is mostly interesting for DJI drones (for example Avata), which can send lots of data like GPS position, speed, altitude, and battery stats. It is usually less interesting for air units, which mostly send camera parameters.

<p float="left">
  <img src="images/additional-options-telemetry.png" alt="Telemetry logging option in settings" width="22%" />
  <img src="images/telemetry-csv.png" alt="Example telemetry CSV output" width="75%" />
</p>

> **Note:** In the future, the goal is to connect ELRS telemetry to the app and add more features around tracking and telemetry logging.


To view and export the flight path, you can use this tool:
[Telemetry Parsing Tool](https://xnuclearsquirrel.github.io/SquirrelCast-Public/tools/telemetry-parsing/)
> **Note:** Only DJI drones have a flight path in their telemetry. It will not work with the air units.

# Using Live View

## Opening Live View

1. Open the navigation menu (button at the top left).
2. Select the **Player** tab to bring up the live video screen.

<p float="left">
  <img src="images/drawer-liveview.png" alt="Open the drawer and locate the Live View tab" width="22%" />
  <img src="images/liveview.png" alt="Live View screen" width="22%" />
</p>

## Recording video and audio

To start or stop recording, press the **Record** button in the top right. It will create a video recording and save it in Movies/SquirrelCast. To add an audio track see [Additional options](manuals/using-live-view.md#additional-options)

<img src="images/liveview-record.png" alt="Record button in the Player tab" width="22%" />

Recording continues even if you:
- Switch out of the Player tab
- Minimize the app
- Lock your phone

You can also start or stop recording from the Android foreground notification. It shows the current recording state and the recording duration.

<p float="left">
  <img src="images/notification-start-rec.png" alt="Foreground notification, start recording" width="50%" /><br />
  <img src="images/notification-rec-running.png" alt="Foreground notification, recording running with duration" width="50%" />
</p>

## Changing camera settings

Tap the **Settings** icon in the bottom right. This opens a menu where you can set the recording parameters of the air unit directly.

These include:
- ISO
- Shutter Speed
- Exposure Bias
- White Balance
- Resolution
- Aspect Ratio
- Framerate

Changing these will directly affect the camera settings of the drone or air unit.

<p float="left">
  <img src="images/settings.png" alt="Settings icon in the Player tab" width="22%" />
  <img src="images/settings-half.png" alt="Settings menu partially expanded" width="22%" />
  <img src="images/settings-full.png" alt="Settings menu fully expanded" width="22%" />
</p>

## Additional options

There are a few optional features hidden in the app settings.

1. Open the main navigation menu.
2. Go to **Settings**.
3. Scroll down to **Additional settings**.

<img src="images/additional-options.png" alt="Additional options in settings" width="22%" />

### Auto record

When enabled, SquirrelCast will automatically start recording in the app whenever the air unit or drone starts recording.

This is useful if your goggles are set to auto record on arm, because SquirrelCast will also start recording on arm, as long as the air unit actually starts recording.

> Note: SquirrelCast will also stop recording automatically when the air unit stops recording, keep that in mind.

### Telemetry logging

Creates a CSV file (in Documents/SquirrelCast) with telemetry parameters received from the goggles. You can set the logging interval in the settings.

This is mostly interesting for DJI drones (for example Avata), which can send lots of data like GPS position, speed, altitude, and battery stats. It is usually less interesting for air units, which mostly send camera parameters.

> Note: In the future, the goal is to connect ELRS telemetry to the app and add more features around tracking and telemetry logging.

### Record phone audio

Requires microphone permission.

Records your phone’s microphone audio during a Live View recording and stores it either:
- as an audio track in the video, or
- as a separate audio file

This is great for adding commentary during a flight and generally makes footage more interesting.

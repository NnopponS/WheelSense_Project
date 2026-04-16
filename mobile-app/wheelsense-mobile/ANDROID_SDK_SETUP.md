# Android SDK Manual Setup Instructions

## Step 1: Download Android Command Line Tools

1. Download from: https://developer.android.com/studio#command-tools
2. Or direct link: https://dl.google.com/android/repository/commandlinetools-win-11076708_latest.zip

## Step 2: Extract to SDK Directory

1. Create folder: `C:\Users\worap\Android\Sdk\cmdline-tools`
2. Extract the zip file contents to that folder
3. Rename the extracted `cmdline-tools` folder to `latest`

Final structure should be:
```
C:\Users\worap\Android\Sdk\cmdline-tools\latest\bin\
C:\Users\worap\Android\Sdk\cmdline-tools\latest\lib\
```

## Step 3: Set Environment Variables

Add to your System Environment Variables (Control Panel > System > Advanced > Environment Variables):

```
ANDROID_HOME = C:\Users\worap\Android\Sdk
ANDROID_SDK_ROOT = C:\Users\worap\Android\Sdk
```

Add to your PATH variable:
```
%ANDROID_HOME%\cmdline-tools\latest\bin
%ANDROID_HOME%\platform-tools
%ANDROID_HOME%\emulator
```

## Step 4: Install SDK Components

Open a new Command Prompt (to get new env vars) and run:

```cmd
sdkmanager --sdk_root=%ANDROID_HOME% "platform-tools" "platforms;android-34" "build-tools;34.0.0" "emulator"
```

## Step 5: Create Android Virtual Device (AVD)

```cmd
avdmanager create avd -n Pixel_7_API_34 -k "system-images;android-34;google_apis;x86_64" -d pixel_7
```

If the system image is not installed, install it first:
```cmd
sdkmanager --sdk_root=%ANDROID_HOME% "system-images;android-34;google_apis;x86_64"
```

## Step 6: Start Emulator

```cmd
emulator -avd Pixel_7_API_34
```

## Step 7: Build and Install WheelSense App

Once emulator is running, in a new terminal:

```cmd
cd C:\Users\worap\Documents\Project\wheelsense-platform\mobile-app\wheelsense-mobile\android
gradlew assembleDebug
adb install app\build\outputs\apk\debug\app-debug.apk
```

## Alternative: Use Android Studio (Easier)

1. Download Android Studio: https://developer.android.com/studio
2. Install with default settings (includes SDK)
3. Open Android Studio > More Actions > Virtual Device Manager
4. Create Pixel 7 device with API 34
5. Start the emulator
6. Build the app as shown in Step 7

## Troubleshooting

- **Java version**: Ensure Java 17+ is installed (check with `java -version`)
- **Environment variables**: Restart terminal after setting env vars
- **ADB not found**: Make sure platform-tools is in PATH
- **Emulator slow**: Enable hardware acceleration (HAXM or Hyper-V)

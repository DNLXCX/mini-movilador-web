import { Adb } from "@yume-chan/adb";
import { AdbDaemonWebUsbDeviceManager } from "@yume-chan/adb-daemon-webusb";
import { AdbScrcpyClient, AdbScrcpyOptions2_0 } from "@yume-chan/adb-scrcpy";
import { WebCodecsVideoDecoder } from "@yume-chan/scrcpy-decoder-webcodecs";
import { ScrcpyPointerId } from "@yume-chan/scrcpy";

const btnConnect = document.getElementById("btn-connect");
const btnPointer = document.getElementById("btn-pointer");
const canvas = document.getElementById("screen-canvas");

const stUsb = document.getElementById("st-usb");
const stAdb = document.getElementById("st-adb");
const stScrcpy = document.getElementById("st-scrcpy");
const stInput = document.getElementById("st-input");

let adb = null;
let scrcpyClient = null;
let scrcpyControl = null;

btnConnect.addEventListener("click", async () => {
  try {
    const manager = AdbDaemonWebUsbDeviceManager.BROWSER;
    if (!manager) {
      alert("WebUSB no es soportado en este navegador.");
      return;
    }

    const device = await manager.requestDevice();
    if (!device) return;

    stUsb.textContent = "USB 🟢";
    stUsb.classList.add("active");

    const connection = await device.connect();
    adb = new Adb(connection);

    stAdb.textContent = "ADB 🟢";
    stAdb.classList.add("active");

    await startScrcpy();
  } catch (err) {
    console.error("Error de conexión ADB:", err);
    alert("Error conectando ADB: " + err.message);
  }
});

async function startScrcpy() {
  try {
    const serverBuffer = await fetch(
      "https://unpkg.com/@yume-chan/scrcpy@latest/server/scrcpy-server"
    ).then((res) => res.arrayBuffer());

    const options = new AdbScrcpyOptions2_0({
      scid: -1,
      sendFrameMeta: false,
      control: true,
      displayId: 0,
      maxSize: 1080,
      videoCodec: "h264",
    });

    scrcpyClient = await AdbScrcpyClient.start(
      adb,
      new Uint8Array(serverBuffer),
      options
    );

    stScrcpy.textContent = "SCRCPY 🟢";
    stScrcpy.classList.add("active");

    if (scrcpyClient.videoStream) {
      const decoder = new WebCodecsVideoDecoder({
        codec: "h264",
        canvas,
      });
      scrcpyClient.videoStream.pipeTo(decoder.writable).catch(console.error);
    }

    scrcpyControl = scrcpyClient.controller;
    if (scrcpyControl) {
      stInput.textContent = "CONTROL 🟢";
      stInput.classList.add("active");
      btnPointer.disabled = false;
      setupInputListeners();
    }
  } catch (err) {
    console.error("Error en Scrcpy:", err);
  }
}

function setupInputListeners() {
  btnPointer.addEventListener("click", () => canvas.requestPointerLock());

  canvas.addEventListener("mousemove", (e) => {
    if (document.pointerLockElement !== canvas || !scrcpyControl) return;
    const rect = canvas.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * canvas.width;
    const y = ((e.clientY - rect.top) / rect.height) * canvas.height;

    scrcpyControl.injectTouch({
      action: 2, // MOVE
      pointerId: ScrcpyPointerId.Mouse,
      position: { x, y },
      pressure: 1.0,
      buttons: e.buttons,
    });
  });

  canvas.addEventListener("mousedown", (e) => injectMouseEvent(e, 0));
  canvas.addEventListener("mouseup", (e) => injectMouseEvent(e, 1));

  window.addEventListener("keydown", (e) => {
    if (document.pointerLockElement !== canvas || !scrcpyControl) return;
    scrcpyControl.injectKeyCode({
      action: 0,
      keyCode: convertJsKeyCodeToAndroid(e.code),
      repeat: e.repeat ? 1 : 0,
      metaState: 0,
    });
  });

  window.addEventListener("keyup", (e) => {
    if (document.pointerLockElement !== canvas || !scrcpyControl) return;
    scrcpyControl.injectKeyCode({
      action: 1,
      keyCode: convertJsKeyCodeToAndroid(e.code),
      repeat: 0,
      metaState: 0,
    });
  });
}

function injectMouseEvent(e, action) {
  if (document.pointerLockElement !== canvas || !scrcpyControl) return;
  const rect = canvas.getBoundingClientRect();
  const x = ((e.clientX - rect.left) / rect.width) * canvas.width;
  const y = ((e.clientY - rect.top) / rect.height) * canvas.height;

  scrcpyControl.injectTouch({
    action,
    pointerId: ScrcpyPointerId.Mouse,
    position: { x, y },
    pressure: action === 1 ? 0 : 1.0,
    buttons: e.buttons,
  });
}

function convertJsKeyCodeToAndroid(code) {
  const map = {
    KeyW: 51, KeyA: 29, KeyS: 47, KeyD: 32,
    Space: 62, ShiftLeft: 59, ControlLeft: 113
  };
  return map[code] || 0;
}

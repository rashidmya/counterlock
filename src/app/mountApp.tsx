import { createRoot } from "react-dom/client";
import { catalog } from "@/shared/catalog";
import { bridge, inOverwolf } from "@/platform/overwolf/store-bridge";
import {
  kWindowNames,
  type ForegroundWindowName,
} from "@/platform/overwolf/constants";
import { DesktopApp } from "./DesktopApp";
import { OverlayApp } from "./OverlayApp";
import "./styles/index.css";

export function mountApp(windowName: ForegroundWindowName) {
  if (windowName !== kWindowNames.desktop && inOverwolf) {
    overwolf.windows.getCurrentWindow((result) => {
      if (!result.success) return;
      document.body.dataset.window = result.window.name;
      createRoot(document.getElementById("root")!).render(
        <OverlayApp
          name={result.window.name}
          catalog={catalog}
          store={bridge}
        />,
      );
    });
    return;
  }
  document.body.dataset.window = windowName;
  createRoot(document.getElementById("root")!).render(
    <DesktopApp windowName={windowName} />,
  );
}

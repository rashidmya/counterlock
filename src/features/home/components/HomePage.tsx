import type { useDesktopMe } from "@/features/profile/me";
import { HomeView } from "./HomeView";

export function HomePage({ me }: { me: ReturnType<typeof useDesktopMe> }) {
  return <HomeView me={me} />;
}

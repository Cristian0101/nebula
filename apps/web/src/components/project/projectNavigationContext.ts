import { createContext, useContext } from "react";
import type { SidebarProjectSnapshot } from "../../sidebarProjectGrouping";

export const ProjectNavigationContext = createContext<SidebarProjectSnapshot | null>(null);
export const useProjectNavigationGroup = () => useContext(ProjectNavigationContext);

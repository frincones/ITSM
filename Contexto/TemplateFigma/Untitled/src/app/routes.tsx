import { createBrowserRouter } from "react-router";
import { Layout } from "./components/Layout";
import { Dashboard } from "./pages/Dashboard";
import { TicketList } from "./pages/TicketList";
import { TicketDetail } from "./pages/TicketDetail";
import { ServicePortal } from "./pages/ServicePortal";
import { KnowledgeBase } from "./pages/KnowledgeBase";
import { ServiceCatalog } from "./pages/ServiceCatalog";
import { Assets } from "./pages/Assets";
import { Automations } from "./pages/Automations";
import { WorkflowBuilder } from "./pages/WorkflowBuilder";
import { Reports } from "./pages/Reports";
import { Settings } from "./pages/Settings";
import { Problems } from "./pages/Problems";
import { Changes } from "./pages/Changes";
import { Login } from "./pages/Login";
import { Notifications } from "./pages/Notifications";
import { Inbox } from "./pages/Inbox";
import { Projects } from "./pages/Projects";

export const router = createBrowserRouter([
  {
    path: "/login",
    Component: Login,
  },
  {
    path: "/",
    Component: Layout,
    children: [
      { index: true, Component: Dashboard },
      { path: "tickets", Component: TicketList },
      { path: "tickets/:id", Component: TicketDetail },
      { path: "inbox", Component: Inbox },
      { path: "problems", Component: Problems },
      { path: "changes", Component: Changes },
      { path: "projects", Component: Projects },
      { path: "portal", Component: ServicePortal },
      { path: "knowledge", Component: KnowledgeBase },
      { path: "catalog", Component: ServiceCatalog },
      { path: "assets", Component: Assets },
      { path: "automations", Component: Automations },
      { path: "automations/new", Component: WorkflowBuilder },
      { path: "automations/:id", Component: WorkflowBuilder },
      { path: "reports", Component: Reports },
      { path: "notifications", Component: Notifications },
      { path: "settings", Component: Settings },
    ],
  },
]);
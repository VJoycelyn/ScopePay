import { Route, Switch } from "wouter";
import { PublicReviewPage } from "./pages/PublicReviewPage";
import { SetupPage } from "./pages/SetupPage";
import { NotFound } from "./pages/NotFound";
import { WorkspacePage } from "./pages/WorkspacePage";

export default function App() {
  return (
    <Switch>
      <Route path="/client/:token">
        {params => <PublicReviewPage token={params.token} />}
      </Route>
      <Route path="/setup">
        <SetupPage />
      </Route>
      <Route path="/">
        <WorkspacePage />
      </Route>
      <Route>
        <NotFound />
      </Route>
    </Switch>
  );
}

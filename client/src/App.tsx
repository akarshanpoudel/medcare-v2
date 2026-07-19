import { Switch, Route } from "wouter";
import Home from "@/pages/Home";
import TrackBooking from "@/pages/TrackBooking";
import StaffLogin from "@/pages/StaffLogin";
import AdminPanel from "@/pages/AdminPanel";
import StaffSecurity from "@/pages/StaffSecurity";
import NotFound from "@/pages/NotFound";

export default function App() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/track" component={TrackBooking} />
      <Route path="/staff/login" component={StaffLogin} />
      <Route path="/staff/admin" component={AdminPanel} />
      <Route path="/staff/security" component={StaffSecurity} />
      <Route component={NotFound} />
    </Switch>
  );
}

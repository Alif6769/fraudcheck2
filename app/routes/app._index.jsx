// app/routes/app._index.jsx
import { redirect } from "react-router";

export function loader() {
  return redirect("/app/order-reports");
}

// This component is never rendered because of the redirect
export default function Index() {
  return null;
}
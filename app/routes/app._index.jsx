// app/routes/app._index.jsx
import { redirect } from "react-router";

export function loader({ request }) {
  const url = new URL(request.url);
  const search = url.search;
  return redirect(`/app/order-reports${search}`);
}

export default function Index() {
  return null;
}
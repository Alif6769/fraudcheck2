import { useEffect } from "react";
import { useNavigate, useLocation } from "react-router";

export default function Index() {
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    navigate(`/app/order-reports${location.search}`, { replace: true });
  }, [navigate, location.search]);

  return null;
}
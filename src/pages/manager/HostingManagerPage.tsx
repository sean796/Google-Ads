import { useEffect } from "react";
import { useNavigate } from "react-router-dom";

/** Legacy path: open Pulse Host inside the main app shell at `/pulse-host`. */
export default function HostingManagerPage() {
  const navigate = useNavigate();
  useEffect(() => {
    navigate("/pulse-host", { replace: true });
  }, [navigate]);
  return null;
}

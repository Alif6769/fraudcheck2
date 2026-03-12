// routes/app.inventory.product-mapping.jsx
import { Outlet } from "react-router";

/**
 * Layout route for /app/inventory/product-mapping
 * Children:
 *  - index: routes/app.inventory.product-mapping._index.jsx (list)
 *  - edit/:id: routes/app.inventory.product-mapping.edit.$id.jsx (edit form)
 */
export default function ProductMappingLayout() {
  return <Outlet />;
}
import { redirect } from 'react-router';

export async function loader() {
  return redirect('/app/inventory/product-mapping');
}

export default function Index() {
  return null;
}
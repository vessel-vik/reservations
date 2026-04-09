import { getMenuItems, getCategories } from "@/lib/actions/pos.actions";
import POSInterface from "@/components/pos/POSInterface";
import { Product, Category } from "@/types/pos.types";
import { menuDocumentToProduct } from "@/lib/pos-menu-product";

export default async function POSPage() {
    // Fetch data on the server (Appwrite may pause projects when idle)
    let products: any[] = [];
    let categories: any[] = [];
    let fetchError: any = null;

    try {
        [products, categories] = await Promise.all([
            getMenuItems(),
            getCategories()
        ]);
    } catch (error) {
        // This should be very rare, but we want to avoid crashing the entire page
        // if the Appwrite project is paused or unreachable.
        console.error("POS data load failed:", error);
        fetchError = error;
        products = [];
        categories = [];
    }

    // Transform Appwrite documents to our Product type if necessary
    // (Assuming structure matches well enough or strictly validated)
    const formattedProducts: Product[] = (products || []).map((doc: any) =>
        menuDocumentToProduct(doc as Record<string, unknown>)
    );

    return (
        <main className="h-screen w-full bg-black">
            {fetchError ? (
                <div className="mx-auto max-w-2xl p-6 text-center text-white">
                    <h1 className="text-2xl font-bold mb-4">Unable to load POS data</h1>
                    <p className="mb-4">
                        The backend appears to be temporarily unavailable. If you are using Appwrite Cloud, please restore your project from the Appwrite console or check your Appwrite server status.
                    </p>
                    <p className="text-sm text-white/70">
                        Error: {fetchError?.message || "Unknown error"}
                    </p>
                </div>
            ) : (
                <POSInterface
                    initialProducts={formattedProducts}
                    initialCategories={categories.map((cat: any) => ({
                        $id: cat.$id,
                        name: cat.name,
                        label: cat.label,
                        slug: cat.slug || cat.name,
                        icon: cat.icon,
                        index: cat.index,
                        parentId: cat.parentId,
                        isActive: cat.isActive
                    }))}
                />
            )}
        </main>
    );
}

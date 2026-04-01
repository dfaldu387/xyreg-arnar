import { useState, useEffect } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { supabase } from "@/integrations/supabase/client";
import { Package } from "lucide-react";

interface Product {
  id: string;
  name: string;
  basic_udi_di: string | null;
  udi_di: string | null;
  inserted_at: string | null;
}

interface DeviceAccessSelectorProps {
  companyId: string;
  selectedProductIds: string[];
  onChange: (ids: string[]) => void;
}

export function DeviceAccessSelector({
  companyId,
  selectedProductIds,
  onChange,
}: DeviceAccessSelectorProps) {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!companyId) return;

    const fetchProducts = async () => {
      setLoading(true);
      try {
        const { data, error } = await supabase
          .from("products")
          .select("id, name, basic_udi_di, udi_di, inserted_at")
          .eq("company_id", companyId)
          .eq("is_archived", false)
          .order("name");

        if (error) throw error;

        // Group by basic_udi_di and pick main device per group (same logic as sidebar)
        const allProducts = data || [];
        const basicUdiGroups = new Map<string, typeof allProducts>();
        const ungrouped: typeof allProducts = [];

        allProducts.forEach((product) => {
          if (product.basic_udi_di) {
            if (!basicUdiGroups.has(product.basic_udi_di)) {
              basicUdiGroups.set(product.basic_udi_di, []);
            }
            basicUdiGroups.get(product.basic_udi_di)!.push(product);
          } else {
            ungrouped.push(product);
          }
        });

        const mainDevices: typeof allProducts = [];

        basicUdiGroups.forEach((products) => {
          const sorted = [...products].sort((a, b) => {
            if (a.udi_di && b.udi_di) {
              const aSuffix = a.udi_di.replace(/\D/g, "").slice(-6);
              const bSuffix = b.udi_di.replace(/\D/g, "").slice(-6);
              if (aSuffix && bSuffix) return aSuffix.localeCompare(bSuffix);
            }
            if (a.udi_di && !b.udi_di) return -1;
            if (!a.udi_di && b.udi_di) return 1;
            return new Date(a.inserted_at || 0).getTime() - new Date(b.inserted_at || 0).getTime();
          });
          mainDevices.push(sorted[0]);
        });

        const filtered = [...mainDevices, ...ungrouped].sort((a, b) =>
          a.name.localeCompare(b.name)
        );

        setProducts(filtered);
      } catch (error) {
        console.error("Error fetching products:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchProducts();
  }, [companyId]);

  const allSelected =
    products.length > 0 &&
    products.every((p) => selectedProductIds.includes(p.id));

  const handleSelectAll = () => {
    if (allSelected) {
      onChange([]);
    } else {
      onChange(products.map((p) => p.id));
    }
  };

  const handleToggle = (productId: string) => {
    if (selectedProductIds.includes(productId)) {
      onChange(selectedProductIds.filter((id) => id !== productId));
    } else {
      onChange([...selectedProductIds, productId]);
    }
  };

  return (
    <div className="space-y-3">
      <Label>Device Access</Label>

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading devices...</p>
      ) : products.length === 0 ? (
        <p className="text-sm text-muted-foreground">No devices available</p>
      ) : (
        <>
          {/* Select All */}
          <div className="flex items-center space-x-2 border-b pb-2">
            <Checkbox
              id="select-all-devices"
              checked={allSelected}
              onCheckedChange={handleSelectAll}
            />
            <Label
              htmlFor="select-all-devices"
              className="text-sm font-medium cursor-pointer"
            >
              Select All ({products.length} devices)
            </Label>
          </div>

          {/* Product list */}
          <ScrollArea className="h-[200px] rounded-md border p-3">
            <div className="space-y-2">
              {products.map((product) => (
                <div key={product.id} className="flex items-center space-x-2">
                  <Checkbox
                    id={`device-${product.id}`}
                    checked={selectedProductIds.includes(product.id)}
                    onCheckedChange={() => handleToggle(product.id)}
                  />
                  <Label
                    htmlFor={`device-${product.id}`}
                    className="text-sm cursor-pointer flex items-center gap-1.5 font-normal"
                  >
                    <Package className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    <span>{product.name}</span>
                  </Label>
                </div>
              ))}
            </div>
          </ScrollArea>

          {selectedProductIds.length > 0 && (
            <p className="text-xs text-muted-foreground">
              {selectedProductIds.length} device{selectedProductIds.length !== 1 ? "s" : ""} selected
            </p>
          )}
        </>
      )}
    </div>
  );
}

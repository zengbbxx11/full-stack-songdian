/*
 * Hook：useGoBack — 浏览器后退导航
 * 职责：调用 router.back() 返回上一页，封装以统一处理不可返回的场景。
 */
import { useRouter } from "next/navigation";

const useGoBack = () => {
  const router = useRouter();

  const goBack = () => {
    if (window.history.length > 1) {
      router.back(); // Navigate to the previous route
    } else {
      router.push("/"); // Redirect to home if no history exists
    }
  };

  return goBack;
};

export default useGoBack;

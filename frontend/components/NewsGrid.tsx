/**
 * NewsGrid —— 首页 Latest News 区块的服务端卡片网格。
 * 保持卡片交互，同时避免为装饰性入场动画注入客户端动画运行时。
 */

import type { PostSummary } from "@/lib/types";
import PostCard from "@/components/PostCard";

interface NewsGridProps {
  posts: PostSummary[];
}

export default function NewsGrid({ posts }: NewsGridProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
      {posts.map((post) => (
        <PostCard key={post.id} post={post} showAuthor={false} />
      ))}
    </div>
  );
}

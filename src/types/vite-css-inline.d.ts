// Vite의 ?inline CSS import — 컴파일된 CSS를 string으로 반환.
// Shadow DOM 안에 <style> 태그로 주입할 때 사용.
declare module '*.css?inline' {
  const css: string;
  export default css;
}

// Vite의 ?url import — 정적 자산을 URL 문자열로 받음 (worker, font 등).
declare module '*?url' {
  const url: string;
  export default url;
}

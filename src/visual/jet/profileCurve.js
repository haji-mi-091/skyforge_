// Shape-preserving cubic interpolation. A horizontal belly minimum stays a
// minimum, rather than overshooting between noisy photo-trace samples.
export function profileCurve(points){
  const p=[...points].sort((a,b)=>a[0]-b[0]),n=p.length;
  const h=p.slice(1).map((v,i)=>v[0]-p[i][0]),d=h.map((v,i)=>(p[i+1][1]-p[i][1])/v),m=[];
  const end=(h0,h1,d0,d1)=>{
    let k=((2*h0+h1)*d0-h0*d1)/(h0+h1);
    if(k*d0<=0)k=0;else if(d0*d1<0&&Math.abs(k)>Math.abs(3*d0))k=3*d0;
    return k;
  };
  m[0]=end(h[0],h[1],d[0],d[1]);m[n-1]=end(h[n-2],h[n-3],d[n-2],d[n-3]);
  for(let i=1;i<n-1;i++){
    const a=d[i-1],b=d[i],w1=2*h[i]+h[i-1],w2=h[i]+2*h[i-1];
    m[i]=a*b<=0?0:(w1+w2)/(w1/a+w2/b);
  }
  return x=>{
    if(x<=p[0][0])return p[0][1]+m[0]*(x-p[0][0]);
    if(x>=p[n-1][0])return p[n-1][1]+m[n-1]*(x-p[n-1][0]);
    let i=0;while(x>p[i+1][0])i++;
    const t=(x-p[i][0])/h[i];
    return (2*t**3-3*t*t+1)*p[i][1]+(t**3-2*t*t+t)*h[i]*m[i]+(-2*t**3+3*t*t)*p[i+1][1]+(t**3-t*t)*h[i]*m[i+1];
  };
}
